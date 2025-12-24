import React, { useState, useEffect } from 'react';
import { AppView, StoryConfig, HistoryItem, ImageHistoryItem, LoreEntry } from './types';
import { StoryWizard } from './components/StoryWizard';
import { StoryView } from './components/StoryView';
import { ImageStudio } from './components/ImageStudio';
import { ChatSection } from './components/ChatAssistant';
import { InfographicStudio } from './components/InfographicStudio';
import { generateStoryStream } from './services/geminiService';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [generatedStory, setGeneratedStory] = useState<string | null>(null);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [activeLore, setActiveLore] = useState<LoreEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // History States
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [imageHistory, setImageHistory] = useState<ImageHistoryItem[]>([]);
  const [libraryTab, setLibraryTab] = useState<'STORIES' | 'IMAGES'>('STORIES');
  
  // Active states for editing
  const [selectedImageToEdit, setSelectedImageToEdit] = useState<ImageHistoryItem | null>(null);

  // Load History on Mount
  useEffect(() => {
    const savedStories = localStorage.getItem('mythos_history');
    if (savedStories) {
      try {
        setHistory(JSON.parse(savedStories));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    const savedImages = localStorage.getItem('mythos_image_history');
    if (savedImages) {
      try {
          setImageHistory(JSON.parse(savedImages));
      } catch (e) {
          console.error("Failed to parse image history", e);
      }
    }
  }, [view]); // Reload when view changes to keep sync

  const saveToHistory = (content: string, config: StoryConfig, lore: LoreEntry[], existingId?: string) => {
    const titleLine = content.split('\n').find(l => l.startsWith('# '));
    const title = titleLine ? titleLine.replace('# ', '').trim() : 'Untitled Story';
    const excerpt = content.slice(0, 150).replace(/[#*]/g, '') + '...';
    
    let newHistory: HistoryItem[];
    let id = existingId || Date.now().toString();

    const configWithLore = { ...config, lore };

    if (existingId) {
        // Update existing item
        newHistory = history.map(h => h.id === existingId ? { ...h, title, excerpt, content, config: configWithLore, lore, timestamp: Date.now() } : h);
        
        // Move to top
        const item = newHistory.find(h => h.id === existingId);
        const others = newHistory.filter(h => h.id !== existingId);
        if (item) newHistory = [item, ...others];
    } else {
         // Create new item
         const newItem: HistoryItem = {
            id,
            timestamp: Date.now(),
            title,
            excerpt,
            content,
            config: configWithLore,
            lore
         };
         newHistory = [newItem, ...history];
    }

    setHistory(newHistory);
    localStorage.setItem('mythos_history', JSON.stringify(newHistory));
    return id;
  };

  const handleStoryComplete = async (config: StoryConfig) => {
    setIsGenerating(true);
    setActiveStoryId(null); // Reset active ID for new story
    setActiveLore([]); // Reset lore for new story
    
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
          const newId = saveToHistory(fullText, config, []);
          setActiveStoryId(newId);
      }
    } catch (e) {
      alert("Something went wrong with the story engine.");
      setView(AppView.DASHBOARD);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStoryContinue = async () => {
    if (!generatedStory || !activeStoryId) return;

    const currentHistoryItem = history.find(h => h.id === activeStoryId);
    if (!currentHistoryItem) return;

    setIsGenerating(true);
    
    // Create a new temporary config that treats the *entire* current story as "existingContent"
    // This forces the AI to read everything so far and continue from the end.
    const continueConfig: StoryConfig = {
        ...currentHistoryItem.config,
        existingContent: generatedStory
    };

    let appendedText = "";
    
    try {
        await generateStoryStream(continueConfig, (chunk) => {
             // chunk is only the NEW text.
             // We want to see the old text + growing new text
             appendedText = chunk;
             setGeneratedStory(generatedStory + "\n\n" + appendedText);
        });

        const finalFullText = generatedStory + "\n\n" + appendedText;
        saveToHistory(finalFullText, currentHistoryItem.config, activeLore, activeStoryId);

    } catch (e) {
        console.error("Continuation failed", e);
        alert("Failed to weave the next chapter.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleStoryUpdate = (newContent: string) => {
      setGeneratedStory(newContent);
      // Auto-save edits if we have an active story ID
      if (activeStoryId) {
          const currentItem = history.find(h => h.id === activeStoryId);
          if (currentItem) {
              saveToHistory(newContent, currentItem.config, activeLore, activeStoryId);
          }
      }
  };

  const handleLoreUpdate = (newLore: LoreEntry[]) => {
      setActiveLore(newLore);
      if (activeStoryId) {
          const currentItem = history.find(h => h.id === activeStoryId);
          if (currentItem) {
              // Update history immediately with new lore so it persists
              saveToHistory(currentItem.content, currentItem.config, newLore, activeStoryId);
          }
      }
  };

  const loadHistoryItem = (item: HistoryItem) => {
      setGeneratedStory(item.content);
      setActiveStoryId(item.id);
      setActiveLore(item.lore || []);
      setView(AppView.STORY_RESULT);
  };

  const loadImageItem = (item: ImageHistoryItem) => {
      setSelectedImageToEdit(item);
      setView(AppView.IMAGE_STUDIO);
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const newHistory = history.filter(h => h.id !== id);
      setHistory(newHistory);
      localStorage.setItem('mythos_history', JSON.stringify(newHistory));
      if (activeStoryId === id) {
          setActiveStoryId(null);
          setGeneratedStory(null);
      }
  }
  
  const deleteImageItem = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const newHistory = imageHistory.filter(h => h.id !== id);
      setImageHistory(newHistory);
      localStorage.setItem('mythos_image_history', JSON.stringify(newHistory));
  };

  const handleNav = (targetView: AppView) => {
      if (targetView === AppView.IMAGE_STUDIO) {
          setSelectedImageToEdit(null);
      }
      setView(targetView);
      setIsMenuOpen(false);
  };

  const renderContent = () => {
    // If generating but no text yet, show thinking state
    if (isGenerating && view === AppView.STORY_RESULT && !generatedStory) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] animate-pulse px-4 text-center">
            <div className="relative w-24 h-24 md:w-32 md:h-32 mb-8">
                <div className="absolute inset-0 border-4 border-brand-700 rounded-full"></div>
                <div className="absolute inset-0 border-t-4 border-brand-gold rounded-full animate-spin"></div>
                <div className="absolute inset-4 border-4 border-brand-800 rounded-full"></div>
                <div className="absolute inset-4 border-b-4 border-brand-accent rounded-full animate-spin-reverse"></div>
            </div>
            <h2 className="text-2xl md:text-4xl font-serif text-white mb-4 tracking-tight">The Muse is awakening...</h2>
            <p className="text-gray-400 text-sm md:text-lg max-w-md">Analyzing your creative vision and weaving the narrative threads.</p>
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
                initialLore={activeLore}
                onReset={() => { setGeneratedStory(null); setActiveStoryId(null); setView(AppView.DASHBOARD); }} 
                isStreaming={isGenerating}
                onUpdate={handleStoryUpdate}
                onLoreUpdate={handleLoreUpdate}
                onContinue={handleStoryContinue}
            />
        );
      case AppView.IMAGE_STUDIO:
        return <ImageStudio initialImage={selectedImageToEdit} />;
      case AppView.INFOGRAPHICS:
        return <InfographicStudio />;
      case AppView.CHAT:
        return <ChatSection />;
      case AppView.HISTORY:
        return (
            <div className="max-w-6xl mx-auto animate-fade-in px-2 md:px-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
                    <h2 className="text-2xl md:text-3xl font-serif text-white">Library</h2>
                    <div className="flex bg-brand-800 p-1 rounded-lg border border-brand-700 w-full md:w-auto">
                        <button 
                            onClick={() => setLibraryTab('STORIES')}
                            className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-bold transition-colors ${libraryTab === 'STORIES' ? 'bg-brand-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            Stories
                        </button>
                        <button 
                            onClick={() => setLibraryTab('IMAGES')}
                            className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-bold transition-colors ${libraryTab === 'IMAGES' ? 'bg-brand-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            Images
                        </button>
                    </div>
                </div>

                {libraryTab === 'STORIES' ? (
                    history.length === 0 ? (
                        <div className="text-center py-20 bg-brand-800 rounded-2xl border border-brand-700">
                            <span className="material-symbols-outlined text-6xl text-gray-600 mb-4">history_edu</span>
                            <p className="text-gray-400 text-lg">No stories written yet.</p>
                            <button onClick={() => setView(AppView.WIZARD)} className="mt-4 text-brand-accent hover:text-white font-medium">Start writing</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                            {history.map(item => (
                                <div key={item.id} onClick={() => loadHistoryItem(item)} className="bg-brand-800 rounded-xl p-5 md:p-6 border border-brand-700 hover:border-brand-gold transition-all cursor-pointer group relative hover:shadow-xl hover:-translate-y-1">
                                    <div className="absolute top-4 right-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => deleteHistoryItem(e, item.id)} className="text-gray-500 hover:text-red-400 p-1">
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                    <h3 className="text-lg md:text-xl font-serif text-white mb-2 line-clamp-1 group-hover:text-brand-gold transition-colors pr-6 md:pr-0">{item.title}</h3>
                                    <p className="text-xs text-gray-500 mb-4">{new Date(item.timestamp).toLocaleDateString()}</p>
                                    <p className="text-sm text-gray-400 line-clamp-3 mb-4">{item.excerpt}</p>
                                    <div className="flex gap-2">
                                        <span className="text-xs px-2 py-1 bg-brand-900 rounded text-brand-accent">{item.config.genre}</span>
                                        {item.lore && item.lore.length > 0 && (
                                            <span className="text-xs px-2 py-1 bg-brand-900 rounded text-purple-400 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">public</span> {item.lore.length}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    // IMAGES TAB
                    imageHistory.length === 0 ? (
                         <div className="text-center py-20 bg-brand-800 rounded-2xl border border-brand-700">
                            <span className="material-symbols-outlined text-6xl text-gray-600 mb-4">image</span>
                            <p className="text-gray-400 text-lg">No images created yet.</p>
                            <button onClick={() => setView(AppView.IMAGE_STUDIO)} className="mt-4 text-brand-gold hover:text-white font-medium">Open Studio</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
                            {imageHistory.map(item => (
                                <div key={item.id} onClick={() => loadImageItem(item)} className="bg-brand-800 rounded-xl overflow-hidden border border-brand-700 hover:border-brand-accent transition-all cursor-pointer group relative hover:shadow-xl hover:-translate-y-1 aspect-square">
                                    <img src={item.imageData} alt={item.prompt} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-brand-900 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 md:p-4">
                                        <p className="text-white font-bold text-xs md:text-sm truncate">{item.mode === 'CREATE' ? 'Generated' : 'Edited'}</p>
                                        <p className="text-[10px] md:text-xs text-gray-300 line-clamp-2 hidden md:block">{item.prompt}</p>
                                    </div>
                                    <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => deleteImageItem(e, item.id)} className="bg-black/50 hover:bg-red-500 text-white p-1.5 rounded-full backdrop-blur-sm">
                                            <span className="material-symbols-outlined text-xs">delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        );
      case AppView.DASHBOARD:
      default:
        return (
          <div className="animate-fade-in pb-12">
            {/* Hero Section */}
            <div className="relative rounded-3xl overflow-hidden bg-brand-800 border border-brand-700 p-6 md:p-20 text-center mb-8 md:mb-12 shadow-2xl">
              <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
                 <div className="absolute top-[-50%] left-[-20%] w-[80%] h-[200%] bg-brand-accent/30 rotate-12 blur-3xl rounded-full mix-blend-screen"></div>
                 <div className="absolute bottom-[-50%] right-[-20%] w-[80%] h-[200%] bg-brand-gold/20 -rotate-12 blur-3xl rounded-full mix-blend-screen"></div>
              </div>
              
              <div className="relative z-10">
                <span className="inline-block py-1 px-3 rounded-full bg-brand-900/50 border border-brand-700 text-brand-gold text-[10px] md:text-xs font-bold tracking-widest uppercase mb-4 md:mb-6">Powered by Strong Mind</span>
                <h1 className="text-4xl md:text-7xl font-serif font-bold text-white mb-4 md:mb-6 tracking-tight drop-shadow-xl leading-tight">
                  Where <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold to-brand-accent">Myth</span> Meets <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-accent to-purple-400">Matter</span>
                </h1>
                <p className="text-base md:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed font-light mb-8 md:mb-10">
                  The comprehensive creative studio for the AI age. Craft award-winning narratives with deep reasoning or transform visuals instantly with natural language.
                </p>
                
                <div className="flex flex-col md:flex-row justify-center gap-3 md:gap-4">
                  <button onClick={() => handleNav(AppView.WIZARD)} className="bg-brand-accent hover:bg-indigo-500 text-white px-6 py-3 md:px-8 md:py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2">
                    Start a Story <span className="material-symbols-outlined">arrow_forward</span>
                  </button>
                  <button onClick={() => { setSelectedImageToEdit(null); handleNav(AppView.IMAGE_STUDIO); }} className="bg-brand-800 hover:bg-brand-700 border border-brand-700 text-white px-6 py-3 md:px-8 md:py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2">
                    Open Studio <span className="material-symbols-outlined">palette</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Main Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 w-full mb-12 md:mb-16">
              {/* Story Engine Card */}
              <button 
                onClick={() => handleNav(AppView.WIZARD)}
                className="group relative bg-brand-800 p-6 md:p-8 rounded-3xl border border-brand-700 hover:border-brand-accent hover:bg-brand-800/80 transition-all text-left overflow-hidden h-full"
              >
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-accent/10 rounded-full group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                <div className="relative z-10 flex flex-col h-full items-start">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-brand-900 rounded-2xl flex items-center justify-center mb-4 md:mb-6 group-hover:bg-brand-accent transition-colors shadow-lg border border-brand-700">
                      <span className="material-symbols-outlined text-white text-xl md:text-2xl">auto_stories</span>
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-white mb-2 font-serif">Story Engine</h3>
                    <p className="text-gray-400 group-hover:text-gray-200 text-xs leading-relaxed mb-2 md:mb-4">Craft complex, multi-layered narratives using deep reasoning.</p>
                </div>
              </button>

              {/* Canvas Studio Card */}
              <button 
                onClick={() => { setSelectedImageToEdit(null); handleNav(AppView.IMAGE_STUDIO); }}
                className="group relative bg-brand-800 p-6 md:p-8 rounded-3xl border border-brand-700 hover:border-brand-gold hover:bg-brand-800/80 transition-all text-left overflow-hidden h-full"
              >
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-gold/10 rounded-full group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                <div className="relative z-10 flex flex-col h-full items-start">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-brand-900 rounded-2xl flex items-center justify-center mb-4 md:mb-6 group-hover:bg-brand-gold transition-colors shadow-lg border border-brand-700">
                      <span className="material-symbols-outlined text-white text-xl md:text-2xl group-hover:text-brand-900">palette</span>
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-white mb-2 font-serif">Canvas Studio</h3>
                    <p className="text-gray-400 group-hover:text-gray-200 text-xs leading-relaxed mb-2 md:mb-4">Edit images with natural language using advanced vision AI.</p>
                </div>
              </button>

              {/* Infographics Card (New) */}
              <button 
                onClick={() => handleNav(AppView.INFOGRAPHICS)}
                className="group relative bg-brand-800 p-6 md:p-8 rounded-3xl border border-brand-700 hover:border-green-400 hover:bg-brand-800/80 transition-all text-left overflow-hidden h-full"
              >
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-green-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                <div className="relative z-10 flex flex-col h-full items-start">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-brand-900 rounded-2xl flex items-center justify-center mb-4 md:mb-6 group-hover:bg-green-500 transition-colors shadow-lg border border-brand-700">
                      <span className="material-symbols-outlined text-white text-xl md:text-2xl">dashboard_customize</span>
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-white mb-2 font-serif">Infographics</h3>
                    <p className="text-gray-400 group-hover:text-gray-200 text-xs leading-relaxed mb-2 md:mb-4">Convert text into visual knowledge cards.</p>
                </div>
              </button>

              {/* Chat Card */}
              <button 
                onClick={() => handleNav(AppView.CHAT)}
                className="group relative bg-brand-800 p-6 md:p-8 rounded-3xl border border-brand-700 hover:border-blue-400 hover:bg-brand-800/80 transition-all text-left overflow-hidden h-full"
              >
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                <div className="relative z-10 flex flex-col h-full items-start">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-brand-900 rounded-2xl flex items-center justify-center mb-4 md:mb-6 group-hover:bg-blue-500 transition-colors shadow-lg border border-brand-700">
                      <span className="material-symbols-outlined text-white text-xl md:text-2xl">chat</span>
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-white mb-2 font-serif">Chat</h3>
                    <p className="text-gray-400 group-hover:text-gray-200 text-xs leading-relaxed mb-2 md:mb-4">Collaborate and brainstorm with your AI assistant.</p>
                </div>
              </button>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 border-t border-brand-700 py-8 md:py-12">
                <div className="p-2 md:p-4 text-center md:text-left">
                  <div className="text-brand-accent mb-2 material-symbols-outlined text-3xl">psychology</div>
                  <h4 className="font-bold text-white mb-1 text-sm md:text-base">Deep Reasoning</h4>
                  <p className="text-xs md:text-sm text-gray-500">Powered by advanced reasoning models.</p>
                </div>
                <div className="p-2 md:p-4 text-center md:text-left">
                  <div className="text-brand-gold mb-2 material-symbols-outlined text-3xl">bolt</div>
                  <h4 className="font-bold text-white mb-1 text-sm md:text-base">Flash Speed</h4>
                  <p className="text-xs md:text-sm text-gray-500">Low latency responses.</p>
                </div>
                <div className="p-2 md:p-4 text-center md:text-left">
                  <div className="text-purple-400 mb-2 material-symbols-outlined text-3xl">menu_book</div>
                  <h4 className="font-bold text-white mb-1 text-sm md:text-base">Book Mode</h4>
                  <p className="text-xs md:text-sm text-gray-500">Immersive reading experience.</p>
                </div>
                <div className="p-2 md:p-4 text-center md:text-left">
                  <div className="text-green-400 mb-2 material-symbols-outlined text-3xl">download</div>
                  <h4 className="font-bold text-white mb-1 text-sm md:text-base">Export Ready</h4>
                  <p className="text-xs md:text-sm text-gray-500">Print friendly formats.</p>
                </div>
            </div>

            {/* Workflow Section */}
            <div className="py-12 md:py-20 border-t border-brand-700/50">
                <div className="text-center mb-10 md:mb-16">
                    <h2 className="text-2xl md:text-4xl font-serif font-bold text-white mb-2 md:mb-4">From Spark to Spectacle</h2>
                    <p className="text-sm md:text-base text-gray-400 max-w-2xl mx-auto px-4">Our intelligent pipeline transforms vague concepts into polished masterpieces.</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-8 relative px-4">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-brand-700 to-transparent z-0"></div>
                    
                    {[
                        { icon: 'lightbulb', title: 'Ignite', desc: 'Input raw ideas, premises, or sketches.' },
                        { icon: 'psychology', title: 'Reason', desc: 'Strong Mind expands depth and logic.' },
                        { icon: 'edit_note', title: 'Refine', desc: 'Collaborate and tweak in real-time.' },
                        { icon: 'auto_awesome_motion', title: 'Materialize', desc: 'Export formatted books or assets.' }
                    ].map((step, idx) => (
                        <div key={idx} className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-16 h-16 md:w-24 md:h-24 bg-brand-800 border-4 border-brand-900 rounded-full flex items-center justify-center mb-4 md:mb-6 shadow-xl relative group">
                                <div className="absolute inset-0 bg-brand-accent/20 rounded-full blur-xl group-hover:bg-brand-gold/30 transition-all"></div>
                                <span className="material-symbols-outlined text-2xl md:text-4xl text-white">{step.icon}</span>
                                <div className="absolute -bottom-2 md:-bottom-3 bg-brand-900 text-brand-gold text-[10px] md:text-xs font-bold px-2 py-0.5 md:px-3 md:py-1 rounded-full border border-brand-700">0{idx + 1}</div>
                            </div>
                            <h3 className="text-sm md:text-xl font-bold text-white mb-1 md:mb-2">{step.title}</h3>
                            <p className="text-xs md:text-sm text-gray-500 max-w-[150px] md:max-w-[200px]">{step.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Use Cases / Gallery Section */}
            <div className="py-12 md:py-20">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
                    <div>
                        <span className="text-brand-accent font-bold tracking-widest uppercase text-xs md:text-sm mb-2 block">For Every Creator</span>
                        <h2 className="text-3xl md:text-4xl font-serif font-bold text-white mb-6">Unleash Your Inner Architect</h2>
                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 flex-shrink-0">
                                    <span className="material-symbols-outlined text-lg md:text-2xl">book_2</span>
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-base md:text-lg">The Novelist</h4>
                                    <p className="text-gray-400 text-xs md:text-sm">Overcome writer's block with a partner that understands foreshadowing, pacing, and character voice.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                                    <span className="material-symbols-outlined text-lg md:text-2xl">sports_esports</span>
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-base md:text-lg">The World Builder</h4>
                                    <p className="text-gray-400 text-xs md:text-sm">Generate lore, political systems, and histories for your RPG campaigns or game worlds.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400 flex-shrink-0">
                                    <span className="material-symbols-outlined text-lg md:text-2xl">brush</span>
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-base md:text-lg">The Visual Artist</h4>
                                    <p className="text-gray-400 text-xs md:text-sm">Describe a mood or style and watch it manifest. Edit existing works with simple commands.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="relative mt-8 md:mt-0">
                        <div className="absolute -inset-4 bg-gradient-to-tr from-brand-accent/20 to-brand-gold/20 rounded-3xl blur-2xl"></div>
                        <div className="relative bg-brand-800 border border-brand-700 rounded-2xl p-6 md:p-8 shadow-2xl overflow-hidden">
                            <div className="flex items-center gap-2 mb-6 border-b border-brand-700 pb-4">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                                <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                                <span className="ml-auto text-[10px] text-gray-500 font-mono hidden md:block">system_instruction: "master_storyteller"</span>
                            </div>
                            <div className="space-y-4 font-mono text-xs md:text-sm text-gray-300">
                                <p><span className="text-blue-400">User:</span> Create a magic system based on sound.</p>
                                <p><span className="text-brand-gold">Model:</span> <span className="text-gray-400 italic">// Thinking...</span></p>
                                <p className="pl-4 border-l-2 border-brand-gold">
                                    The "Resonance" system operates on the frequency of matter. <span className="text-white font-bold">Sonancers</span> use tuning forks crafted from starmetal...
                                    <br/><br/>
                                    - <span className="text-brand-accent">Low Hum</span>: Earth manipulation.
                                    <br/>
                                    - <span className="text-brand-accent">High Pitch</span>: Air/Lightning.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer / CTA */}
            <div className="mt-8 md:mt-12 bg-gradient-to-r from-brand-800 to-brand-900 rounded-3xl p-8 md:p-12 text-center border border-brand-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                <div className="relative z-10">
                    <h2 className="text-2xl md:text-3xl font-serif text-white mb-6">Ready to Create?</h2>
                    <button onClick={() => handleNav(AppView.WIZARD)} className="bg-brand-gold hover:bg-yellow-400 text-brand-900 px-8 py-3 md:px-10 md:py-4 rounded-xl font-bold text-base md:text-lg shadow-xl hover:shadow-yellow-400/20 transition-all transform hover:-translate-y-1">
                        Begin Your Journey
                    </button>
                </div>
            </div>
            
            {/* Recent History Snippet (Combined) */}
            {(history.length > 0 || imageHistory.length > 0) && (
              <div className="mt-8 md:mt-12 bg-brand-900/50 border border-brand-700/50 rounded-2xl p-4 md:p-6">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base md:text-lg font-bold text-white">Continue Creating</h3>
                    <button onClick={() => handleNav(AppView.HISTORY)} className="text-xs text-brand-accent hover:text-white">View All</button>
                 </div>
                 <div className="grid gap-4 md:grid-cols-2">
                    {/* Story Snippet */}
                    {history.slice(0, 1).map(item => (
                       <div key={item.id} onClick={() => loadHistoryItem(item)} className="bg-brand-800 p-3 md:p-4 rounded-xl border border-brand-700 cursor-pointer hover:border-brand-600 flex items-center gap-4">
                          <div className="h-10 w-10 rounded bg-brand-700 flex items-center justify-center flex-shrink-0">
                             <span className="material-symbols-outlined text-gray-400">article</span>
                          </div>
                          <div className="overflow-hidden">
                             <h4 className="text-white font-medium truncate text-sm">{item.title}</h4>
                             <p className="text-[10px] md:text-xs text-gray-500 truncate">{new Date(item.timestamp).toLocaleDateString()} • Story</p>
                          </div>
                       </div>
                    ))}
                    {/* Image Snippet */}
                    {imageHistory.slice(0, 1).map(item => (
                       <div key={item.id} onClick={() => loadImageItem(item)} className="bg-brand-800 p-3 md:p-4 rounded-xl border border-brand-700 cursor-pointer hover:border-brand-600 flex items-center gap-4">
                          <div className="h-10 w-10 rounded bg-brand-700 overflow-hidden flex-shrink-0">
                             <img src={item.imageData} alt="" className="w-full h-full object-cover opacity-80" />
                          </div>
                          <div className="overflow-hidden">
                             <h4 className="text-white font-medium truncate text-sm">{item.mode === 'CREATE' ? 'Generated Art' : 'Edited Image'}</h4>
                             <p className="text-[10px] md:text-xs text-gray-500 truncate">{new Date(item.timestamp).toLocaleDateString()} • Visual</p>
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
    <div className="h-screen flex flex-col bg-brand-900 text-gray-100 font-sans selection:bg-brand-accent selection:text-white overflow-hidden">
      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
         <div 
             className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm animate-fade-in"
             onClick={() => setIsMenuOpen(false)}
         />
      )}

      {/* Header - Fixed Height, Flex None */}
      <nav className="flex-none h-12 md:h-14 border-b border-brand-700 bg-brand-900/90 backdrop-blur z-50 shadow-sm relative">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-full flex items-center justify-between">
            {/* Logo */}
            <div 
              className="flex items-center gap-2 md:gap-3 cursor-pointer group flex-shrink-0 z-50" 
              onClick={() => handleNav(AppView.DASHBOARD)}
            >
                <div className="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-brand-gold to-brand-accent rounded-lg flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                    <span className="material-symbols-outlined text-brand-900 text-base md:text-lg">auto_awesome</span>
                </div>
                <span className="font-serif font-bold text-base md:text-lg tracking-wide text-white hidden sm:block">Mythos & Canvas</span>
                <span className="font-serif font-bold text-base tracking-wide text-white sm:hidden">Mythos</span>
            </div>
            
            {/* Desktop Nav */}
            <div className="hidden md:flex gap-1 bg-brand-800/50 p-1 rounded-full border border-brand-700/50">
                {[
                    { id: AppView.WIZARD, label: 'Story' },
                    { id: AppView.IMAGE_STUDIO, label: 'Images' },
                    { id: AppView.INFOGRAPHICS, label: 'Infographics' },
                    { id: AppView.CHAT, label: 'Chat' },
                    { id: AppView.HISTORY, label: 'Library' }
                ].map(item => (
                    <button 
                        key={item.id}
                        onClick={() => handleNav(item.id)}
                        className={`text-xs md:text-sm font-medium px-4 py-1.5 rounded-full transition-all whitespace-nowrap ${view === item.id ? 'bg-brand-700 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {/* Mobile Menu Toggle */}
            <button 
                className="md:hidden p-2 text-gray-400 hover:text-white focus:outline-none active:scale-95 transition-transform z-50"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-label="Toggle Menu"
            >
                <span className="material-symbols-outlined text-xl">
                    {isMenuOpen ? 'close' : 'menu'}
                </span>
            </button>
        </div>

        {/* Mobile Dropdown */}
        <div className={`absolute top-full left-0 w-full bg-brand-900 border-b border-brand-700 shadow-2xl transition-all duration-300 ease-in-out origin-top md:hidden z-40 ${isMenuOpen ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-4 opacity-0 pointer-events-none'}`}>
             <div className="p-4 space-y-2 flex flex-col">
                {[
                    { id: AppView.WIZARD, label: 'Story', icon: 'auto_stories' },
                    { id: AppView.IMAGE_STUDIO, label: 'Images', icon: 'palette' },
                    { id: AppView.INFOGRAPHICS, label: 'Infographics', icon: 'dashboard_customize' },
                    { id: AppView.CHAT, label: 'Chat', icon: 'chat' },
                    { id: AppView.HISTORY, label: 'Library', icon: 'history_edu' }
                ].map(item => (
                    <button 
                        key={item.id}
                        onClick={() => handleNav(item.id)}
                        className={`flex items-center gap-4 w-full text-left px-4 py-3 rounded-xl transition-all ${view === item.id ? 'bg-brand-800 text-white font-bold border border-brand-700 shadow-sm' : 'text-gray-400 hover:bg-brand-800/50 hover:text-white'}`}
                    >
                        <span className={`material-symbols-outlined ${view === item.id ? 'text-brand-gold' : ''}`}>{item.icon}</span>
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
      </nav>

      {/* Main Area - Flex-1 to fill remaining space. Chat is overflow-hidden to let internal scroll work. Others scroll here. */}
      <main className={`flex-1 relative min-h-0 ${view === AppView.CHAT || view === AppView.INFOGRAPHICS ? 'overflow-hidden flex flex-col' : 'overflow-y-auto scroll-smooth'}`}>
        {view !== AppView.CHAT && view !== AppView.INFOGRAPHICS ? (
             <div className="container mx-auto px-4 py-4 md:py-8">
                 {renderContent()}
             </div>
        ) : (
             renderContent()
        )}
      </main>

      <style>{`
        @keyframes spin-reverse {
            to { transform: rotate(-360deg); }
        }
        .animate-spin-reverse {
            animation: spin-reverse 1s linear infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};
export default App;