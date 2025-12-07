import React, { useState, useRef, useEffect } from 'react';
import { structureInfographicData, generateImage } from '../services/geminiService';
import { InfographicItem } from '../types';
import { jsPDF } from 'jspdf';

const USE_CASES = [
    { id: 'custom', label: 'Custom / Scratch', desc: 'Define your own topic.', prompt: '', style: 'Swiss' },
    { id: 'linkedin', label: 'LinkedIn Carousel', desc: 'Professional slides for social media.', prompt: 'Create a thought leadership carousel about: ', style: 'Corporate Minimalism' },
    { id: 'executive', label: 'Executive Summary', desc: 'High-level decisions and metrics.', prompt: 'Summarize these meeting notes into key decisions: ', style: 'Swiss' },
    { id: 'flashcards', label: 'Educational Flashcards', desc: 'Visual learning aids.', prompt: 'Create study flashcards for: ', style: 'Flat 2.5D' },
    { id: 'pitch', label: 'Startup Pitch Deck', desc: 'Problem, Solution, Market.', prompt: 'Visualize a pitch deck for a startup that does: ', style: 'Neo-Futuristic' },
    { id: 'onboarding', label: 'Onboarding Guide', desc: 'Step-by-step process.', prompt: 'Create an onboarding workflow for: ', style: 'Hand Drawn' },
    { id: 'book', label: 'Book Summary', desc: 'Key takeaways and metaphors.', prompt: 'Visualize the key concepts of the book: ', style: 'Swiss' },
    { id: 'recipe', label: 'Recipe Visuals', desc: 'Ingredients and cooking steps.', prompt: 'Create a visual recipe guide for: ', style: 'Hand Drawn' },
    { id: 'features', label: 'Feature Highlights', desc: 'Product capabilities.', prompt: 'Showcase the features of: ', style: 'Corporate Minimalism' },
    { id: 'travel', label: 'Travel Itinerary', desc: 'Locations and activities.', prompt: 'Visual itinerary for a trip to: ', style: 'Flat 2.5D' },
    { id: 'goals', label: 'Goal Visualization', desc: 'Vision board style.', prompt: 'Visualize these personal goals: ', style: 'Neo-Futuristic' },
];

const STYLES = [
    { id: 'Swiss', label: 'Swiss', desc: 'Bold typography, grids, high contrast.', icon: 'grid_view' },
    { id: 'Corporate Minimalism', label: 'Tech Minimal', desc: 'Clean lines, blue accents, flat.', icon: 'business' },
    { id: 'Hand Drawn', label: 'Sketchy', desc: 'Organic lines, marker texture.', icon: 'draw' },
    { id: 'Neo-Futuristic', label: 'Cyber', desc: 'Neon glows, dark mode, geometry.', icon: 'hub' },
    { id: 'Flat 2.5D', label: 'Isometric', desc: '3D depth, soft shadows, cute.', icon: 'view_in_ar' },
    { id: 'Custom', label: 'Custom', desc: 'Define your own aesthetic.', icon: 'edit' }
];

const ASPECT_RATIOS = [
    { label: 'Square', value: '1:1', icon: 'crop_square' },
    { label: 'Story', value: '9:16', icon: 'crop_portrait' },
    { label: 'Slide', value: '16:9', icon: 'crop_16_9' },
    { label: 'Card', value: '4:3', icon: 'crop_landscape' },
];

export const InfographicStudio: React.FC = () => {
    const [inputText, setInputText] = useState('');
    const [selectedStyle, setSelectedStyle] = useState(STYLES[0].id);
    const [customStylePrompt, setCustomStylePrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('4:3');
    const [useCase, setUseCase] = useState(USE_CASES[0].id);
    const [isPlanning, setIsPlanning] = useState(false);
    const [items, setItems] = useState<InfographicItem[]>([]);
    const [fileName, setFileName] = useState<string | null>(null);
    const [includeOverlay, setIncludeOverlay] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Mobile View State
    const [mobileTab, setMobileTab] = useState<'EDITOR' | 'RESULTS'>('EDITOR');

    // Presentation Mode State
    const [slideIndex, setSlideIndex] = useState<number | null>(null);

    const handleUseCaseChange = (id: string) => {
        setUseCase(id);
        const uc = USE_CASES.find(u => u.id === id);
        if (uc) {
            setInputText(uc.prompt);
            setSelectedStyle(uc.style);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFileName(file.name);
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target?.result as string;
                if (text) setInputText(prev => prev + '\n\n' + text);
            };
            reader.readAsText(file);
        }
    };

    const clearFile = () => {
        setFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setInputText('');
    };

    const handlePlan = async () => {
        if (!inputText.trim()) return;
        setIsPlanning(true);
        
        // On mobile, auto-switch to results tab to show loading state
        if (window.innerWidth < 1024) {
            setMobileTab('RESULTS');
        }

        setItems([]);
        try {
            const styleToUse = selectedStyle === 'Custom' ? customStylePrompt : selectedStyle;
            const structuredItems = await structureInfographicData(inputText, styleToUse);
            // Initialize items with the selected aspect ratio
            const initializedItems = structuredItems.map(item => ({ ...item, aspectRatio }));
            setItems(initializedItems);
            generateAllImages(initializedItems);
        } catch (e) {
            alert("Failed to analyze text. Please try again.");
            setIsPlanning(false); // Only unset if error
        } finally {
            setIsPlanning(false);
        }
    };

    const generateAllImages = async (itemsToGen: InfographicItem[]) => {
        const promises = itemsToGen.map(async (item) => {
           await generateSingleItem(item);
        });
        await Promise.allSettled(promises);
    };

    const generateSingleItem = async (item: InfographicItem) => {
        try {
            setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'generating' } : p));
            
            const styleToUse = selectedStyle === 'Custom' ? customStylePrompt : selectedStyle;
            
            // Refined Prompt to avoid overriding complex diagram backgrounds (e.g. maps/scenes)
            const enhancedPrompt = `${item.visualPrompt} (${styleToUse} style). High resolution, detailed, explanatory visualization, 2k.`;
            
            const rawImageUrl = await generateImage(enhancedPrompt, item.aspectRatio || aspectRatio);
            
            let finalImageUrl = rawImageUrl;
            if (includeOverlay) {
                finalImageUrl = await renderImageWithOverlay(rawImageUrl, item.title, item.summary, item.aspectRatio || aspectRatio);
            }

            setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'done', imageData: finalImageUrl } : p));
        } catch (e) {
            setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'failed' } : p));
        }
    };

    const handleRegenerate = (e: React.MouseEvent, item: InfographicItem) => {
        e.stopPropagation();
        generateSingleItem(item);
    };

    // Text Overlay Engine using Canvas
    const renderImageWithOverlay = (base64Image: string, title: string, summary: string, ratio: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Set high resolution canvas
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(base64Image);
                    return;
                }

                // Draw Base Image
                ctx.drawImage(img, 0, 0);

                // Overlay Settings
                const isVertical = ratio === '9:16';
                const padding = canvas.width * 0.05;
                const bottomAreaHeight = canvas.height * (isVertical ? 0.25 : 0.3);
                
                // Gradient Background for Text
                const gradient = ctx.createLinearGradient(0, canvas.height - bottomAreaHeight, 0, canvas.height);
                gradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
                gradient.addColorStop(0.2, 'rgba(15, 23, 42, 0.9)');
                gradient.addColorStop(1, 'rgba(15, 23, 42, 1)');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(0, canvas.height - bottomAreaHeight, canvas.width, bottomAreaHeight);

                // Text Settings
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                
                // Draw Title
                const titleSize = Math.floor(canvas.width * 0.05);
                ctx.font = `bold ${titleSize}px 'Inter', sans-serif`;
                ctx.fillText(title, padding, canvas.height - (bottomAreaHeight * 0.6));

                // Draw Summary (Word Wrap)
                const summarySize = Math.floor(canvas.width * 0.03);
                ctx.font = `normal ${summarySize}px 'Inter', sans-serif`;
                ctx.fillStyle = '#cbd5e1';
                
                const maxWidth = canvas.width - (padding * 2);
                const words = summary.split(' ');
                let line = '';
                let y = canvas.height - (bottomAreaHeight * 0.45);
                const lineHeight = summarySize * 1.4;

                for(let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' ';
                    const metrics = ctx.measureText(testLine);
                    const testWidth = metrics.width;
                    if (testWidth > maxWidth && n > 0) {
                        ctx.fillText(line, padding, y);
                        line = words[n] + ' ';
                        y += lineHeight;
                    } else {
                        line = testLine;
                    }
                }
                ctx.fillText(line, padding, y);

                resolve(canvas.toDataURL('image/png'));
            };
            img.src = base64Image;
        });
    };

    const handleExportPDF = () => {
        if (items.length === 0) return;
        
        // Use A4 landscape or portrait depending on majority aspect ratio, simplfied to A4 Landscape for now
        const doc = new jsPDF({
            orientation: aspectRatio === '9:16' ? 'portrait' : 'landscape',
        });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        items.forEach((item, index) => {
            if (index > 0) doc.addPage();
            
            // Add background color
            doc.setFillColor(15, 23, 42); // Brand 900
            doc.rect(0, 0, pageWidth, pageHeight, 'F');

            if (item.imageData) {
                // Calculate Fit
                const imgProps = doc.getImageProperties(item.imageData);
                const imgRatio = imgProps.width / imgProps.height;
                let w = pageWidth;
                let h = w / imgRatio;
                if (h > pageHeight) {
                    h = pageHeight;
                    w = h * imgRatio;
                }
                const x = (pageWidth - w) / 2;
                const y = (pageHeight - h) / 2;
                
                doc.addImage(item.imageData, 'PNG', x, y, w, h);
            }
        });

        doc.save('mythos_infographic_deck.pdf');
    };

    const handleDownload = (e: React.MouseEvent, item: InfographicItem) => {
        e.stopPropagation();
        if (item.imageData) {
            const link = document.createElement('a');
            link.href = item.imageData;
            link.download = `infographic_${item.title.replace(/\s+/g, '_')}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    // --- Slide View Logic ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (slideIndex === null) return;
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setSlideIndex(prev => (prev !== null && prev < items.length - 1 ? prev + 1 : prev));
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setSlideIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setSlideIndex(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [slideIndex, items.length]);

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100dvh-50px)] md:h-[calc(100dvh-60px)] overflow-hidden gap-0 bg-[#0a0f1c] animate-fade-in relative">
            
            {/* Mobile Navigation Tabs */}
            <div className="lg:hidden flex-none flex border-b border-brand-800 bg-[#0f172a] z-30">
                <button 
                    onClick={() => setMobileTab('EDITOR')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${mobileTab === 'EDITOR' ? 'text-brand-accent border-b-2 border-brand-accent bg-brand-800/50' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    <span className="material-symbols-outlined text-lg">tune</span> Editor
                </button>
                <button 
                    onClick={() => setMobileTab('RESULTS')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${mobileTab === 'RESULTS' ? 'text-brand-gold border-b-2 border-brand-gold bg-brand-800/50' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    <span className="material-symbols-outlined text-lg">grid_view</span> Results
                    {items.length > 0 && <span className="bg-brand-700 text-white px-1.5 rounded-full text-[10px] shadow-sm">{items.length}</span>}
                </button>
            </div>

            {/* Left Panel: Configuration */}
            <div className={`w-full lg:w-[400px] bg-[#0f172a] border-r border-brand-800 flex-col z-20 shadow-2xl h-full flex-shrink-0 ${mobileTab === 'EDITOR' ? 'flex' : 'hidden lg:flex'}`}>
                {/* Header */}
                <div className="p-6 pb-4 border-b border-brand-800 bg-[#0f172a]">
                    <h2 className="text-xl font-serif text-white mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-brand-gold text-2xl">dashboard_customize</span>
                        Infographics
                    </h2>
                    <p className="text-xs text-gray-500">Transform text into visual diagrams and knowledge cards.</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    
                    {/* Step 1: Content Input */}
                    <div className="bg-[#1e293b]/50 rounded-xl border border-brand-700 p-4 relative group hover:border-brand-600 transition-colors">
                        <div className="absolute top-0 right-0 p-2 opacity-10 font-black text-6xl text-white pointer-events-none -mt-2 -mr-2">1</div>
                        <label className="text-[10px] font-bold text-brand-accent uppercase tracking-widest mb-3 block flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-brand-accent text-white flex items-center justify-center text-[10px]">1</span>
                            Content Source
                        </label>
                        
                        <div className="mb-3">
                             <select 
                                value={useCase} 
                                onChange={(e) => handleUseCaseChange(e.target.value)}
                                className="w-full bg-[#0f172a] border border-brand-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all cursor-pointer mb-2"
                            >
                                {USE_CASES.map(uc => (
                                    <option key={uc.id} value={uc.id}>{uc.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="relative">
                            <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Paste your article notes, documentation, or summary here..."
                                className="w-full bg-[#0f172a] border border-brand-700 rounded-xl p-3 text-sm text-gray-200 focus:ring-1 focus:ring-brand-accent focus:border-brand-accent transition-all resize-none h-28 placeholder-gray-600 shadow-inner"
                            />
                            <div className="absolute bottom-2 right-2 flex gap-2">
                                {fileName && (
                                    <button onClick={clearFile} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 bg-black/40 px-2 py-1 rounded">
                                        <span className="material-symbols-outlined text-[12px]">close</span> {fileName}
                                    </button>
                                )}
                                <label className="cursor-pointer bg-brand-800 hover:bg-brand-700 border border-brand-700 text-gray-400 hover:text-white p-1.5 rounded-lg flex items-center justify-center transition-all shadow-sm active:scale-95" title="Upload Text File">
                                    <span className="material-symbols-outlined text-lg">upload_file</span>
                                    <input 
                                        ref={fileInputRef}
                                        type="file" 
                                        accept=".txt,.md,.json,.csv"
                                        onChange={handleFileUpload}
                                        className="hidden" 
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Step 2: Visual Style */}
                    <div className="bg-[#1e293b]/50 rounded-xl border border-brand-700 p-4 relative group hover:border-brand-600 transition-colors">
                        <div className="absolute top-0 right-0 p-2 opacity-10 font-black text-6xl text-white pointer-events-none -mt-2 -mr-2">2</div>
                        <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest mb-3 block flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-brand-gold text-brand-900 flex items-center justify-center text-[10px]">2</span>
                            Visual Style
                        </label>
                        
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            {STYLES.map(style => (
                                <button
                                    key={style.id}
                                    onClick={() => setSelectedStyle(style.id)}
                                    className={`relative p-2 rounded-lg border text-center transition-all duration-200 flex flex-col items-center gap-1 group ${selectedStyle === style.id ? 'bg-brand-800 border-brand-gold/50 shadow-lg shadow-brand-gold/5' : 'bg-transparent border-brand-800 hover:bg-brand-800/50'}`}
                                >
                                    <span className={`material-symbols-outlined text-xl group-hover:scale-110 transition-transform ${selectedStyle === style.id ? 'text-brand-gold' : 'text-gray-500'}`}>{style.icon}</span>
                                    <span className={`text-[9px] font-bold leading-tight ${selectedStyle === style.id ? 'text-white' : 'text-gray-400'}`}>{style.label}</span>
                                </button>
                            ))}
                        </div>
                        {selectedStyle === 'Custom' && (
                            <input 
                                type="text"
                                value={customStylePrompt}
                                onChange={(e) => setCustomStylePrompt(e.target.value)}
                                placeholder="e.g. 1950s comic book style, highly detailed..."
                                className="w-full bg-[#0f172a] border border-brand-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-gold animate-fade-in"
                            />
                        )}
                    </div>

                    {/* Step 3: Format */}
                    <div className="bg-[#1e293b]/50 rounded-xl border border-brand-700 p-4 relative group hover:border-brand-600 transition-colors">
                         <div className="absolute top-0 right-0 p-2 opacity-10 font-black text-6xl text-white pointer-events-none -mt-2 -mr-2">3</div>
                        <label className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                             <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px]">3</span>
                             Format & Layout
                        </label>
                        
                        <div className="flex gap-2 overflow-x-auto pb-1 mb-3 scrollbar-hide">
                             {ASPECT_RATIOS.map(ratio => (
                                <button 
                                    key={ratio.value}
                                    onClick={() => setAspectRatio(ratio.value)}
                                    className={`flex-shrink-0 px-3 py-2 rounded-lg border text-center transition-all flex items-center gap-2 ${aspectRatio === ratio.value ? 'bg-brand-700 border-blue-400 text-white' : 'bg-brand-900 border-brand-800 text-gray-500 hover:text-gray-300'}`}
                                >
                                    <span className="material-symbols-outlined text-sm">{ratio.icon}</span>
                                    <span className="text-[10px] font-bold">{ratio.label}</span>
                                </button>
                            ))}
                        </div>
                        
                        <button 
                            onClick={() => setIncludeOverlay(!includeOverlay)}
                            className={`w-full py-2 px-3 rounded-lg border flex items-center justify-between transition-all ${includeOverlay ? 'bg-brand-700 border-blue-400 text-white' : 'bg-brand-900 border-brand-800 text-gray-500'}`}
                        >
                            <span className="text-[10px] font-bold flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">title</span> Auto-Caption Overlay
                            </span>
                            <div className={`w-8 h-4 rounded-full relative transition-colors ${includeOverlay ? 'bg-blue-500' : 'bg-gray-600'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${includeOverlay ? 'left-4.5' : 'left-0.5'}`} style={{ left: includeOverlay ? 'calc(100% - 14px)' : '2px' }}></div>
                            </div>
                        </button>
                    </div>

                </div>

                {/* Footer Action */}
                <div className="p-6 border-t border-brand-700 bg-[#0f172a] z-10">
                    <button
                        onClick={handlePlan}
                        disabled={!inputText || isPlanning}
                        className="w-full py-4 bg-gradient-to-r from-brand-accent to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                    >
                        {isPlanning ? (
                            <>
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                Architecting...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-xl">auto_awesome_motion</span>
                                Generate Visuals
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Right Panel: Results */}
            <div className={`flex-1 bg-[#0a0f1c] overflow-y-auto p-4 md:p-8 relative custom-scrollbar ${mobileTab === 'RESULTS' ? 'block' : 'hidden lg:block'}`}>
                {/* Background Pattern */}
                <div 
                    className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                    style={{ 
                        backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', 
                        backgroundSize: '24px 24px' 
                    }}
                ></div>

                {items.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-60 relative z-10 min-h-[50vh]">
                        <div className="w-32 h-32 bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-[2rem] flex items-center justify-center mb-8 border border-brand-700/50 shadow-2xl rotate-6 transform hover:rotate-3 transition-transform duration-700">
                            <span className="material-symbols-outlined text-7xl text-brand-gold/80 drop-shadow-lg">grid_view</span>
                        </div>
                        <h3 className="text-3xl font-serif text-white mb-3 tracking-tight">Visual Knowledge Engine</h3>
                        <p className="text-gray-400 max-w-sm text-sm leading-relaxed">
                            Configure your visual narrative on the left, and watch your infographic deck materialize here.
                        </p>
                    </div>
                ) : (
                    <div className="max-w-7xl mx-auto relative z-10 pb-10">
                        <div className="sticky top-0 z-20 bg-[#0a0f1c]/80 backdrop-blur-md py-4 mb-6 flex justify-between items-center border-b border-brand-800">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                    Generated Assets
                                    <span className="px-2.5 py-0.5 rounded-full bg-brand-800 text-brand-gold text-xs font-mono border border-brand-700 shadow-inner">{items.length}</span>
                                </h3>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setSlideIndex(0)} className="bg-brand-800 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-brand-700 shadow-sm hover:shadow-md">
                                    <span className="material-symbols-outlined text-lg">slideshow</span> Present
                                </button>
                                <button onClick={handleExportPDF} className="bg-brand-accent hover:bg-brand-accent/80 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors shadow-lg hover:shadow-blue-500/20">
                                    <span className="material-symbols-outlined text-lg">picture_as_pdf</span> Export Deck
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
                            {items.map((item, idx) => (
                                <div 
                                    key={item.id} 
                                    onClick={() => setSlideIndex(idx)}
                                    className="bg-[#1e293b]/40 backdrop-blur-sm rounded-2xl overflow-hidden border border-brand-700/50 shadow-xl flex flex-col group hover:border-brand-500/50 hover:bg-[#1e293b]/60 transition-all duration-300 animate-fade-in-up hover:-translate-y-2 cursor-pointer relative" 
                                    style={{ animationDelay: `${idx * 100}ms` }}
                                >
                                    {/* Number Badge */}
                                    <div className="absolute top-4 left-4 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur border border-white/10 flex items-center justify-center text-xs font-bold text-white shadow-lg pointer-events-none">
                                        {idx + 1}
                                    </div>

                                    {/* Image Container */}
                                    <div className={`bg-black/20 relative overflow-hidden ${item.aspectRatio === '9:16' ? 'aspect-[9/16]' : item.aspectRatio === '16:9' ? 'aspect-video' : item.aspectRatio === '1:1' ? 'aspect-square' : 'aspect-[4/3]'}`}>
                                        {item.status === 'done' && item.imageData ? (
                                            <>
                                                <img src={item.imageData} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                                
                                                {/* Desktop Overlay Actions */}
                                                <div className="hidden md:flex absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center gap-3 backdrop-blur-[2px]">
                                                    <button 
                                                        onClick={(e) => handleRegenerate(e, item)}
                                                        className="h-10 w-10 bg-white/10 text-white border border-white/20 rounded-full hover:bg-white hover:text-black hover:scale-110 transition-all shadow-lg flex items-center justify-center backdrop-blur-md"
                                                        title="Regenerate This Tile"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">refresh</span>
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleDownload(e, item)}
                                                        className="h-10 w-10 bg-white/10 text-white border border-white/20 rounded-full hover:bg-white hover:text-black hover:scale-110 transition-all shadow-lg flex items-center justify-center backdrop-blur-md"
                                                        title="Download"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">download</span>
                                                    </button>
                                                </div>
                                            </>
                                        ) : item.status === 'failed' ? (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-red-400 p-4 text-center bg-red-900/10">
                                                <span className="material-symbols-outlined text-3xl mb-2 opacity-50">broken_image</span>
                                                <p className="text-xs font-medium">Generation Failed</p>
                                                <button onClick={(e) => handleRegenerate(e, item)} className="mt-2 text-[10px] underline hover:text-white">Retry</button>
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-brand-gold bg-[#0a0f1c]">
                                                <div className="w-12 h-12 border-4 border-brand-800 border-t-brand-gold rounded-full animate-spin mb-4"></div>
                                                <p className="text-[10px] uppercase tracking-widest animate-pulse font-bold text-brand-gold">Rendering...</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Card Content */}
                                    <div className="p-5 flex-1 flex flex-col relative border-t border-white/5">
                                        <h4 className="text-base font-bold text-white mb-2 leading-tight pr-4 group-hover:text-brand-gold transition-colors">{item.title}</h4>
                                        <p className="text-xs text-gray-400 leading-relaxed flex-1 line-clamp-3 group-hover:line-clamp-none transition-all duration-300">{item.summary}</p>
                                        
                                        {/* Footer / Mobile Actions */}
                                        <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center opacity-70 md:opacity-50 group-hover:opacity-100 transition-opacity">
                                             <span className="text-[10px] font-mono text-gray-500 uppercase">Nano Banana Pro</span>
                                             <span className="flex gap-2">
                                                <span className="material-symbols-outlined text-gray-400 text-sm md:hidden">open_in_full</span>
                                                <span className="material-symbols-outlined text-gray-500 text-sm hidden md:block">open_in_full</span>
                                             </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Slide/Presentation Modal */}
            {slideIndex !== null && items[slideIndex] && (
                <div className="fixed inset-0 z-50 bg-[#0a0f1c]/95 backdrop-blur-xl flex flex-col animate-fade-in">
                    {/* Slide Header */}
                    <div className="flex justify-between items-center p-4 border-b border-white/10 bg-black/20 flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <span className="text-white font-bold text-lg font-mono">
                                {String(slideIndex + 1).padStart(2, '0')} <span className="text-gray-600 font-normal">/ {String(items.length).padStart(2, '0')}</span>
                            </span>
                            <h3 className="text-gray-300 text-sm hidden md:block border-l border-white/20 pl-4 font-medium tracking-wide">{items[slideIndex].title}</h3>
                        </div>
                        <div className="flex items-center gap-3">
                             <button 
                                onClick={(e) => handleRegenerate(e, items[slideIndex])} 
                                className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                                title="Regenerate"
                            >
                                <span className="material-symbols-outlined text-xl">refresh</span>
                            </button>
                             <button 
                                onClick={(e) => handleDownload(e, items[slideIndex])} 
                                className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                                title="Download Image"
                            >
                                <span className="material-symbols-outlined text-xl">download</span>
                            </button>
                            <button 
                                onClick={() => setSlideIndex(null)} 
                                className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                            >
                                <span className="material-symbols-outlined text-2xl">close</span>
                            </button>
                        </div>
                    </div>

                    {/* Main Slide Content */}
                    <div className="flex-1 relative flex items-center justify-center p-4 md:p-10 overflow-hidden">
                        {/* Navigation Arrows */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); setSlideIndex(prev => prev !== null && prev > 0 ? prev - 1 : prev)}}
                            disabled={slideIndex === 0}
                            className="absolute left-2 md:left-8 top-1/2 -translate-y-1/2 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-full bg-black/40 hover:bg-brand-accent text-white disabled:opacity-0 disabled:pointer-events-none transition-all border border-white/10 backdrop-blur-md z-20 group hover:scale-110 active:scale-90"
                        >
                            <span className="material-symbols-outlined text-3xl md:text-4xl group-hover:-translate-x-1 transition-transform">chevron_left</span>
                        </button>
                        
                        <button 
                            onClick={(e) => { e.stopPropagation(); setSlideIndex(prev => prev !== null && prev < items.length - 1 ? prev + 1 : prev)}}
                            disabled={slideIndex === items.length - 1}
                            className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-full bg-black/40 hover:bg-brand-accent text-white disabled:opacity-0 disabled:pointer-events-none transition-all border border-white/10 backdrop-blur-md z-20 group hover:scale-110 active:scale-90"
                        >
                            <span className="material-symbols-outlined text-3xl md:text-4xl group-hover:translate-x-1 transition-transform">chevron_right</span>
                        </button>

                        {/* Image Wrapper with Animation Key */}
                        <div key={slideIndex} className="relative w-full h-full flex flex-col items-center justify-center animate-fade-in transform transition-all duration-300">
                            {items[slideIndex].status === 'done' && items[slideIndex].imageData ? (
                                <img 
                                    src={items[slideIndex].imageData} 
                                    alt={items[slideIndex].title} 
                                    className="max-h-[70vh] w-auto max-w-full md:max-w-[90vw] object-contain shadow-2xl rounded-lg border border-white/5"
                                />
                            ) : (
                                <div className="w-64 h-64 flex items-center justify-center bg-white/5 rounded-2xl">
                                     <span className="w-10 h-10 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></span>
                                </div>
                            )}
                            
                            {/* Caption Overlay */}
                            <div className="mt-6 md:mt-8 max-w-3xl text-center px-4">
                                <h2 className="text-xl md:text-3xl font-bold text-white mb-2 md:mb-3 font-serif">{items[slideIndex].title}</h2>
                                <p className="text-gray-400 text-sm md:text-lg leading-relaxed font-light line-clamp-3 md:line-clamp-none" onClick={(e) => e.currentTarget.classList.toggle('line-clamp-3')}>{items[slideIndex].summary}</p>
                            </div>
                        </div>
                    </div>

                    {/* Filmstrip Thumbnails */}
                    <div className="h-20 md:h-24 border-t border-white/10 bg-black/40 flex items-center justify-center gap-3 p-3 overflow-x-auto flex-shrink-0 backdrop-blur-md">
                        {items.map((item, idx) => (
                            <button 
                                key={item.id}
                                onClick={() => setSlideIndex(idx)}
                                className={`h-full aspect-square rounded-lg overflow-hidden border-2 transition-all relative flex-shrink-0 ${slideIndex === idx ? 'border-brand-gold ring-2 ring-brand-gold/20 opacity-100 scale-105' : 'border-transparent opacity-40 hover:opacity-80 hover:scale-105'}`}
                            >
                                {item.imageData ? (
                                    <img src={item.imageData} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-xs text-gray-500">image</span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};