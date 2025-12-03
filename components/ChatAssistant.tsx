import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/geminiService';
import { ChatMessage } from '../types';

export const ChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Hello! I am your creative assistant. How can I help refine your story ideas today?', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

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
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-80 md:w-96 h-[500px] bg-brand-800 border border-brand-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          <div className="bg-brand-900 p-4 border-b border-brand-700 flex justify-between items-center">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-accent">voice_chat</span>
              Gemini Assistant
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-brand-accent text-white rounded-br-none' 
                    : 'bg-brand-700 text-gray-200 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-brand-700 rounded-2xl p-3 rounded-bl-none flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-brand-900 border-t border-brand-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about your story..."
                className="flex-1 bg-brand-800 border border-brand-700 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
              />
              <button 
                onClick={handleSend}
                disabled={isLoading}
                className="bg-brand-accent hover:bg-indigo-500 text-white p-2 rounded-full flex items-center justify-center disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">send</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-brand-accent hover:bg-indigo-500 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105"
      >
        <span className="material-symbols-outlined text-2xl">
          {isOpen ? 'expand_more' : 'chat_bubble'}
        </span>
      </button>
    </div>
  );
};
