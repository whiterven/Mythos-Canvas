import React, { useState, useEffect } from 'react';
import { AppView, StoryConfig, HistoryItem } from './types';
import { StoryWizard } from './components/StoryWizard';
import { StoryView } from './components/StoryView';
import { ImageStudio } from './components/ImageStudio';
import { ChatAssistant } from './components/ChatAssistant';
import { generateStoryStream } from './services/geminiService';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [generatedStory, setGeneratedStory] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load History on Mount
  useEffect(() => {
    const saved = localStorage.getItem('mythos_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const saveToHistory = (content: string, config: StoryConfig) => {
    const titleLine = content.split('\n').find(l => l.startsWith('# '));
    const title = titleLine ? titleLine.replace('# ', '').trim() : 'Untitled Story';
    const excerpt = content.slice(0, 150).replace(/[#*]/g, '') + '...';
    
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      title,
      excerpt,
      content,
      config
    };

    const newHistory = [newItem, ...history];
    setHistory(newHistory);
    localStorage.setItem('mythos_history', JSON.stringify(newHistory));
  };

  const handleStoryComplete = async (config: StoryConfig) => {
    setIsGenerating(true);
    
    // If Continuing, we start with the existing content
    const startingText = config.existingContent ? config.existingContent + '\n\n' : '';
    setGeneratedStory(startingText); 
    setView(AppView.STORY_RESULT); 
    
    let fullText = startingText;
    
    try {
      await generateStoryStream(config, (chunk) => {
          // chunk is the accumulated *new* text from the stream
          const updatedFull = startingText + chunk;
          setGeneratedStory(updatedFull);
          fullText = updatedFull;
      });
      // Save when done
      if (fullText) {
          saveToHistory(fullText, config);
      }
    } catch (e) {
      alert("Something went wrong with the story engine.");
      setView(AppView.DASHBOARD);
    } finally {
      setIsGenerating(false);
    }
  };

  const loadHistoryItem = (item: HistoryItem) => {
      setGeneratedStory(item.content);
      setView(AppView.STORY_RESULT);
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const newHistory = history.filter(h => h.id !== id);
      setHistory(newHistory);
      localStorage.setItem('mythos_history', JSON.stringify(newHistory));
  }

  const renderContent = () => {
    // If generating but no text yet, show thinking state
    if (isGenerating && view === AppView.STORY_RESULT && !generatedStory) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] animate-pulse">
            <div className="relative w-32 h-32 mb-8">
                <div className="absolute inset-0 border-4 border-brand-700 rounded-full"></div>
                <div className="absolute inset-0 border-t-4 border-brand-gold rounded-full animate-spin"></div>
                <div className="absolute inset-4 border-4 border-brand-800 rounded-full"></div>
                <div className="absolute inset-4 border-b-4 border-brand-accent rounded-full animate-spin-reverse"></div>
            </div>
            <h2 className="text-4xl font-serif text-white mb-4 tracking-tight">Weaving Narrative</h2>
            <p className="text-gray-400 text-lg max-w-md text-center">Consulting the muse... Gemini 3.0 Pro is analyzing your constraints and structuring the plot.</p>
        </div>
      );
    }

    switch (view) {
      case AppView.WIZARD:
        return <StoryWizard onComplete={handleStoryComplete} onCancel={() => setView(AppView.DASHBOARD)} />;
      case AppView.STORY_RESULT:
        return (
            <StoryView 
                content={generatedStory || ''} 
                onReset={() => { setGeneratedStory(null); setView(AppView.DASHBOARD); }} 
                isStreaming={isGenerating}
            />
        );
      case AppView.IMAGE_STUDIO:
        return <ImageStudio />;
      case AppView.HISTORY:
        return (
            <div className="max-w-5xl mx-auto animate-fade-in">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-serif text-white">Your Chronicles</h2>
                    <button onClick={() => setView(AppView.DASHBOARD)} className="text-gray-400 hover:text-white">Back to Dashboard</button>
                </div>
                {history.length === 0 ? (
                    <div className="text-center py-20 bg-brand-800 rounded-2xl border border-brand-700">
                        <span className="material-symbols-outlined text-6xl text-gray-600 mb-4">history_edu</span>
                        <p className="text-gray-400 text-lg">No stories written yet.</p>
                        <button onClick={() => setView(AppView.WIZARD)} className="mt-4 text-brand-accent hover:text-white">Start writing</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {history.map(item => (
                            <div key={item.id} onClick={() => loadHistoryItem(item)} className="bg-brand-800 rounded-xl p-6 border border-brand-700 hover:border-brand-gold transition-all cursor-pointer group relative hover:shadow-xl hover:-translate-y-1">
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => deleteHistoryItem(e, item.id)} className="text-gray-500 hover:text-red-400 p-1">
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                                <h3 className="text-xl font-serif text-white mb-2 line-clamp-1 group-hover:text-brand-gold transition-colors">{item.title}</h3>
                                <p className="text-xs text-gray-500 mb-4">{new Date(item.timestamp).toLocaleDateString()}</p>
                                <p className="text-sm text-gray-400 line-clamp-3 mb-4">{item.excerpt}</p>
                                <div className="flex gap-2">
                                    <span className="text-xs px-2 py-1 bg-brand-900 rounded text-brand-accent">{item.config.genre}</span>
                                    <span className="text-xs px-2 py-1 bg-brand-900 rounded text-gray-400">{item.config.lengthStructure.split(' ')[0]}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
      case AppView.DASHBOARD:
      default:
        return (
          <div className="animate-fade-in pb-12">
            {/* Hero Section */}
            <div className="relative rounded-3xl overflow-hidden bg-brand-800 border border-brand-700 p-12 md:p-20 text-center mb-12 shadow-2xl">
              <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
                 <div className="absolute top-[-50%] left-[-20%] w-[80%] h-[200%] bg-brand-accent/30 rotate-12 blur-3xl rounded-full mix-blend-screen"></div>
                 <div className="absolute bottom-[-50%] right-[-20%] w-[80%] h-[200%] bg-brand-gold/20 -rotate-12 blur-3xl rounded-full mix-blend-screen"></div>
              </div>
              
              <div className="relative z-10">
                <span className="inline-block py-1 px-3 rounded-full bg-brand-900/50 border border-brand-700 text-brand-gold text-xs font-bold tracking-widest uppercase mb-6">Powered by Gemini 1.5 & 3.0</span>
                <h1 className="text-5xl md:text-7xl font-serif font-bold text-white mb-6 tracking-tight drop-shadow-xl">
                  Where <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold to-brand-accent">Myth</span> Meets <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-accent to-purple-400">Matter</span>
                </h1>
                <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed font-light mb-10">
                  The comprehensive creative studio for the AI age. Craft award-winning narratives with deep reasoning or transform visuals instantly with natural language.
                </p>
                
                <div className="flex flex-wrap justify-center gap-4">
                  <button onClick={() => setView(AppView.WIZARD)} className="bg-brand-accent hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-indigo-500/25 flex items-center gap-2">
                    Start a Story <span className="material-symbols-outlined">arrow_forward</span>
                  </button>
                  <button onClick={() => setView(AppView.IMAGE_STUDIO)} className="bg-brand-800 hover:bg-brand-700 border border-brand-700 text-white px-8 py-3 rounded-xl font-medium transition-all flex items-center gap-2">
                    Open Studio <span className="material-symbols-outlined">palette</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Main Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-16">
              {/* Story Engine Card */}
              <button 
                onClick={() => setView(AppView.WIZARD)}
                className="group relative bg-brand-800 p-8 rounded-3xl border border-brand-700 hover:border-brand-accent hover:bg-brand-800/80 transition-all text-left overflow-hidden h-full"
              >
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-accent/10 rounded-full group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                <div className="relative z-10 flex flex-col h-full">
                    <div className="w-14 h-14 bg-brand-900 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-brand-accent transition-colors shadow-lg border border-brand-700">
                      <span className="material-symbols-outlined text-white text-2xl">auto_stories</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2 font-serif">Story Engine</h3>
                    <p className="text-gray-400 group-hover:text-gray-200 text-sm leading-relaxed mb-4">Craft complex, multi-layered narratives using the 32k context window of Gemini 3 Pro.</p>
                    <div className="mt-auto flex items-center text-brand-accent text-sm font-bold uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                      Create Now <span className="material-symbols-outlined text-sm ml-1">chevron_right</span>
                    </div>
                </div>
              </button>

              {/* Nano Studio Card */}
              <button 
                onClick={() => setView(AppView.IMAGE_STUDIO)}
                className="group relative bg-brand-800 p-8 rounded-3xl border border-brand-700 hover:border-brand-gold hover:bg-brand-800/80 transition-all text-left overflow-hidden h-full"
              >
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-gold/10 rounded-full group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                <div className="relative z-10 flex flex-col h-full">
                    <div className="w-14 h-14 bg-brand-900 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-brand-gold transition-colors shadow-lg border border-brand-700">
                      <span className="material-symbols-outlined text-white text-2xl group-hover:text-brand-900">palette</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2 font-serif">Nano Studio</h3>
                    <p className="text-gray-400 group-hover:text-gray-200 text-sm leading-relaxed mb-4">Edit images with natural language ("Add a retro filter") using Gemini 2.5 Flash.</p>
                     <div className="mt-auto flex items-center text-brand-gold text-sm font-bold uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                      Design Now <span className="material-symbols-outlined text-sm ml-1">chevron_right</span>
                    </div>
                </div>
              </button>

              {/* Chronicles Card */}
              <button 
                onClick={() => setView(AppView.HISTORY)}
                className="group relative bg-brand-800 p-8 rounded-3xl border border-brand-700 hover:border-purple-400 hover:bg-brand-800/80 transition-all text-left overflow-hidden h-full"
              >
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-purple-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                <div className="relative z-10 flex flex-col h-full">
                    <div className="w-14 h-14 bg-brand-900 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-purple-500 transition-colors shadow-lg border border-brand-700">
                      <span className="material-symbols-outlined text-white text-2xl">history_edu</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2 font-serif">Chronicles</h3>
                    <p className="text-gray-400 group-hover:text-gray-200 text-sm leading-relaxed mb-4">Access your saved stories, drafts, and past masterpieces in your private library.</p>
                    <div className="mt-auto flex items-center text-purple-400 text-sm font-bold uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                      View Library <span className="material-symbols-outlined text-sm ml-1">chevron_right</span>
                    </div>
                </div>
              </button>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-brand-700 pt-12">
                <div className="p-4">
                  <div className="text-brand-accent mb-2 material-symbols-outlined text-3xl">psychology</div>
                  <h4 className="font-bold text-white mb-1">Deep Reasoning</h4>
                  <p className="text-sm text-gray-500">Powered by Gemini 3 Pro with thinking capabilities.</p>
                </div>
                <div className="p-4">
                  <div className="text-brand-gold mb-2 material-symbols-outlined text-3xl">bolt</div>
                  <h4 className="font-bold text-white mb-1">Flash Speed</h4>
                  <p className="text-sm text-gray-500">Low latency responses for quick edits and analysis.</p>
                </div>
                <div className="p-4">
                  <div className="text-purple-400 mb-2 material-symbols-outlined text-3xl">menu_book</div>
                  <h4 className="font-bold text-white mb-1">Book Mode</h4>
                  <p className="text-sm text-gray-500">Immersive 3D page-flip reading experience.</p>
                </div>
                <div className="p-4">
                  <div className="text-green-400 mb-2 material-symbols-outlined text-3xl">download</div>
                  <h4 className="font-bold text-white mb-1">Export Ready</h4>
                  <p className="text-sm text-gray-500">Print friendly formats and persistent history.</p>
                </div>
            </div>
            
            {/* Recent History Snippet (Optional - only if history exists) */}
            {history.length > 0 && (
              <div className="mt-12 bg-brand-900/50 border border-brand-700/50 rounded-2xl p-6">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white">Continue Writing</h3>
                    <button onClick={() => setView(AppView.HISTORY)} className="text-xs text-brand-accent hover:text-white">View All</button>
                 </div>
                 <div className="grid gap-4 md:grid-cols-2">
                    {history.slice(0, 2).map(item => (
                       <div key={item.id} onClick={() => loadHistoryItem(item)} className="bg-brand-800 p-4 rounded-xl border border-brand-700 cursor-pointer hover:border-brand-600 flex items-center gap-4">
                          <div className="h-10 w-10 rounded bg-brand-700 flex items-center justify-center flex-shrink-0">
                             <span className="material-symbols-outlined text-gray-400">article</span>
                          </div>
                          <div className="overflow-hidden">
                             <h4 className="text-white font-medium truncate">{item.title}</h4>
                             <p className="text-xs text-gray-500 truncate">{new Date(item.timestamp).toLocaleDateString()} • {item.config.genre}</p>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-brand-900 text-gray-100 font-sans selection:bg-brand-accent selection:text-white">
      {/* Header */}
      <nav className="border-b border-brand-700 bg-brand-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div 
              className="flex items-center gap-3 cursor-pointer group" 
              onClick={() => setView(AppView.DASHBOARD)}
            >
                <div className="w-10 h-10 bg-gradient-to-br from-brand-gold to-brand-accent rounded-lg flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                    <span className="material-symbols-outlined text-brand-900 text-2xl">auto_awesome</span>
                </div>
                <span className="font-serif font-bold text-xl tracking-wide text-white">Mythos & Canvas</span>
            </div>
            <div className="flex gap-2 bg-brand-800/50 p-1.5 rounded-full border border-brand-700/50">
                <button 
                    onClick={() => setView(AppView.WIZARD)}
                    className={`text-sm font-medium px-5 py-2 rounded-full transition-all ${view === AppView.WIZARD ? 'bg-brand-700 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                >
                    Story
                </button>
                <button 
                    onClick={() => setView(AppView.IMAGE_STUDIO)}
                    className={`text-sm font-medium px-5 py-2 rounded-full transition-all ${view === AppView.IMAGE_STUDIO ? 'bg-brand-700 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                >
                    Images
                </button>
                <button 
                    onClick={() => setView(AppView.HISTORY)}
                    className={`text-sm font-medium px-5 py-2 rounded-full transition-all ${view === AppView.HISTORY ? 'bg-brand-700 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                >
                    Library
                </button>
            </div>
        </div>
      </nav>

      {/* Main Area */}
      <main className="container mx-auto px-4 py-8">
        {renderContent()}
      </main>

      <ChatAssistant />
      
      <style>{`
        @keyframes spin-reverse {
            to { transform: rotate(-360deg); }
        }
        .animate-spin-reverse {
            animation: spin-reverse 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default App;