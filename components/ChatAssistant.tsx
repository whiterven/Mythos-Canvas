import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/geminiService';
import { ChatMessage } from '../types';

export const ChatSection: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Greetings. I am your Strong Mind assistant. I can help you brainstorm plot twists, research historical details, or refine your character arcs. Where shall we begin?', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Format history for the SDK
    const history = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const responseText = await sendChatMessage(history, userMsg.text);
    
    setMessages(prev => [...prev, {
      role: 'model',
      text: responseText,
      timestamp: Date.now()
    }]);
    setIsLoading(false);
  };

  return (
    <div className="flex h-[calc(100vh-140px)] bg-brand-800 rounded-2xl border border-brand-700 overflow-hidden animate-fade-in shadow-2xl">
      {/* Sidebar (Visual only for now) */}
      <div className="hidden md:flex w-64 flex-col bg-brand-900/50 border-r border-brand-700 p-4">
        <button 
            onClick={() => setMessages([{ role: 'model', text: 'How can I assist you with your story today?', timestamp: Date.now() }])}
            className="flex items-center gap-2 w-full bg-brand-accent hover:bg-indigo-500 text-white p-3 rounded-xl mb-6 transition-colors font-medium shadow-lg"
        >
            <span className="material-symbols-outlined">add</span>
            New Session
        </button>

        <div className="flex-1 overflow-y-auto">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-2">Recent Context</h3>
            <div className="space-y-2">
                <div className="p-3 bg-brand-800 rounded-lg text-sm text-gray-300 border border-brand-700 cursor-pointer hover:border-brand-accent/50 transition-colors">
                    <span className="line-clamp-1">Story Brainstorming</span>
                    <span className="text-xs text-gray-500">Just now</span>
                </div>
            </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative bg-brand-800">
        <div className="absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-brand-800 to-transparent pointer-events-none z-10"></div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 scroll-smooth" ref={scrollRef}>
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
              <div className={`flex gap-4 max-w-[85%] md:max-w-[70%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${
                    msg.role === 'user' ? 'bg-brand-accent' : 'bg-brand-gold'
                }`}>
                    <span className="material-symbols-outlined text-sm md:text-base text-brand-900 font-bold">
                        {msg.role === 'user' ? 'person' : 'auto_awesome'}
                    </span>
                </div>

                {/* Bubble */}
                <div className={`p-4 md:p-6 rounded-2xl text-base leading-relaxed shadow-md ${
                  msg.role === 'user' 
                    ? 'bg-brand-accent text-white rounded-tr-none' 
                    : 'bg-brand-900 border border-brand-700 text-gray-200 rounded-tl-none'
                }`}>
                  {msg.text.split('\n').map((line, i) => (
                      <p key={i} className={`min-h-[1rem] ${i > 0 ? 'mt-2' : ''}`}>{line}</p>
                  ))}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
               <div className="flex gap-4 max-w-[70%]">
                    <div className="w-10 h-10 rounded-full bg-brand-gold flex items-center justify-center flex-shrink-0 shadow-lg">
                        <span className="material-symbols-outlined text-brand-900">auto_awesome</span>
                    </div>
                    <div className="bg-brand-900 border border-brand-700 p-6 rounded-2xl rounded-tl-none flex items-center gap-2">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></div>
                    </div>
               </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-brand-800 border-t border-brand-700 relative z-20">
          <div className="max-w-4xl mx-auto flex gap-4 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                  }
              }}
              placeholder="Ask for ideas, refinements, or analysis..."
              className="flex-1 bg-brand-900 border border-brand-700 rounded-2xl px-6 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all resize-none h-16 shadow-inner scrollbar-hide"
            />
            <button 
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="absolute right-3 top-3 bottom-3 bg-brand-accent hover:bg-indigo-500 disabled:opacity-50 disabled:bg-brand-700 text-white aspect-square rounded-xl flex items-center justify-center transition-all shadow-lg hover:shadow-indigo-500/25"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
          <p className="text-center text-xs text-gray-600 mt-2">Strong Mind can make mistakes. Check important info.</p>
        </div>
      </div>
    </div>
  );
};