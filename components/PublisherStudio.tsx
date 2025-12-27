
import React, { useState, useEffect, useRef } from 'react';
import { HistoryItem, PublishingConfig } from '../types';
import { generateImageVariations } from '../services/geminiService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Footer, PageNumber, PageBreak, Header } from "docx";
import { jsPDF } from 'jspdf';

interface Props {
    activeStoryId: string | null;
    history: HistoryItem[];
    onUpdateStory: (id: string, updates: Partial<HistoryItem>) => void;
    onSelectStory: (id: string) => void;
}

const DEFAULT_CONFIG: PublishingConfig = {
    layout: {
        headingFont: 'Playfair Display',
        bodyFont: 'Merriweather',
        fontSize: 11,
        dropCaps: true,
        lineHeight: 1.6,
        alignment: 'justify',
        sceneDivider: 'asterisk',
        header: 'title-author',
        footer: 'page-num'
    },
    metadata: {
        author: '',
        dedication: '',
        copyright: new Date().getFullYear().toString(),
        isbn: ''
    },
    coverResolution: '2K',
    backCoverBlurb: "A gripping tale that defies expectations.",
    includeTOC: true,
    paperSize: '6x9',
    margins: 'normal',
    extraSections: []
};

// Defined in Inches for accurate scaling
const PAPER_SIZES = [
    { id: '5x8', label: '5" x 8" (Pocket)', width: 5, height: 8 },
    { id: '6x9', label: '6" x 9" (Trade)', width: 6, height: 9 },
    { id: 'A5', label: 'A5 (International)', width: 5.83, height: 8.27 },
    { id: 'A4', label: 'A4 (Standard)', width: 8.27, height: 11.69 },
    { id: 'Letter', label: 'US Letter', width: 8.5, height: 11 },
];

const MARGIN_MAP = {
    narrow: 0.5,
    normal: 0.8,
    wide: 1.2,
};

// Map margins to TWIPs for DOCX (1 inch = 1440 TWIPs)
const INCH_TO_TWIP = 1440;

const FONTS = [
    { name: 'Merriweather', type: 'Serif' },
    { name: 'Playfair Display', type: 'Display' },
    { name: 'EB Garamond', type: 'Classic' },
    { name: 'Roboto', type: 'Sans' },
    { name: 'Lato', type: 'Modern' },
    { name: 'Cinzel', type: 'Fantasy' },
];

// Visual Rulers Component
const Ruler: React.FC<{ orientation: 'horizontal' | 'vertical', length: number, scale: number }> = ({ orientation, length, scale }) => {
    const ticks = [];
    const pixelsPerInch = 96 * scale;
    
    for (let i = 0; i <= length; i++) {
        ticks.push(
            <div key={i} className="absolute flex flex-col justify-end" 
                style={{ 
                    [orientation === 'horizontal' ? 'left' : 'top']: `${i * pixelsPerInch}px`,
                    [orientation === 'horizontal' ? 'height' : 'width']: '100%',
                    [orientation === 'horizontal' ? 'width' : 'height']: '1px',
                }}>
                <div className={`bg-gray-500 ${orientation === 'horizontal' ? 'h-3 w-px' : 'w-3 h-px'}`}></div>
                <span className="text-[9px] text-gray-500 absolute" style={{ [orientation === 'horizontal' ? 'top' : 'left']: '14px', transform: orientation === 'horizontal' ? 'translateX(-50%)' : 'translateY(-50%)' }}>{i}</span>
            </div>
        );
        // Half inch ticks
        if (i < length) {
             ticks.push(
                <div key={`${i}-half`} className={`absolute bg-gray-600 opacity-50 ${orientation === 'horizontal' ? 'h-2 w-px' : 'w-2 h-px'}`}
                    style={{ 
                        [orientation === 'horizontal' ? 'left' : 'top']: `${(i + 0.5) * pixelsPerInch}px`,
                    }} 
                />
             );
        }
    }

    return (
        <div className={`relative bg-[#0a0f1c] border-gray-700 ${orientation === 'horizontal' ? 'h-8 border-b w-full' : 'w-8 border-r h-full'}`}>
            {ticks}
        </div>
    );
};

export const PublisherStudio: React.FC<Props> = ({ activeStoryId, history, onUpdateStory }) => {
    const [activeTab, setActiveTab] = useState<'LAYOUT' | 'TYPOGRAPHY' | 'CONTENT' | 'COVER' | 'EXPORT'>('LAYOUT');
    const [config, setConfig] = useState<PublishingConfig>(DEFAULT_CONFIG);
    const [isExporting, setIsExporting] = useState(false);
    const [zoom, setZoom] = useState(0.8); // 80% view default
    const [showGuides, setShowGuides] = useState(true);
    
    // For Cover Gen
    const [isGeneratingCover, setIsGeneratingCover] = useState(false);
    const [coverPrompt, setCoverPrompt] = useState('');
    const [coverVariations, setCoverVariations] = useState<string[]>([]);

    const activeStory = history.find(h => h.id === activeStoryId);

    // Load config
    useEffect(() => {
        if (activeStory) {
            setConfig(activeStory.publishingConfig || {
                ...DEFAULT_CONFIG,
                metadata: { ...DEFAULT_CONFIG.metadata, author: 'Unknown Author' },
                backCoverBlurb: activeStory.excerpt || DEFAULT_CONFIG.backCoverBlurb
            });
            setCoverPrompt(activeStory.config.corePremise || "");
        }
    }, [activeStoryId]);

    // Auto-save
    useEffect(() => {
        if (activeStoryId && activeStory) {
            const timer = setTimeout(() => {
                onUpdateStory(activeStoryId, { publishingConfig: config });
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [config, activeStoryId]);

    const handleGenerateCover = async () => {
        setIsGeneratingCover(true);
        setCoverVariations([]);
        try {
            const prompt = `Book cover art. Title: "${activeStory?.title}". Concept: ${coverPrompt}. High resolution, professional typography not required (art only).`;
            const variations = await generateImageVariations(prompt, { aspectRatio: "2:3", model: "gemini-3-pro-image-preview", imageSize: "2K" }, 4);
            setCoverVariations(variations);
            if (!config.coverImage) setConfig(prev => ({ ...prev, coverImage: variations[0] }));
        } catch (e) {
            alert("Cover generation failed.");
        } finally {
            setIsGeneratingCover(false);
        }
    };

    const handleExport = async (format: 'PDF' | 'DOCX') => {
        if (!activeStory) return;
        setIsExporting(true);
        
        try {
            if (format === 'DOCX') {
                const marginTwips = (MARGIN_MAP[config.margins || 'normal'] || 0.8) * INCH_TO_TWIP;
                const paper = PAPER_SIZES.find(p => p.id === config.paperSize) || PAPER_SIZES[1];
                
                const children: any[] = [];

                // Styles & Fonts
                // Note: DOCX JS requires fonts to be installed on system usually, but we set the name
                
                // --- Title Page ---
                children.push(
                    new Paragraph({
                        text: activeStory.title,
                        heading: HeadingLevel.TITLE,
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 4000, after: 1000 },
                        run: { font: config.layout.headingFont, size: 48, bold: true }
                    }),
                    new Paragraph({
                        text: config.metadata.author,
                        alignment: AlignmentType.CENTER,
                        run: { font: config.layout.bodyFont, size: 24 }
                    }),
                    new Paragraph({ children: [new PageBreak()] })
                );

                // --- Content ---
                const lines = activeStory.content.split('\n');
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed) return;

                    if (trimmed.startsWith('## ')) {
                        children.push(new Paragraph({
                            text: trimmed.replace('## ', ''),
                            heading: HeadingLevel.HEADING_2,
                            alignment: AlignmentType.CENTER,
                            pageBreakBefore: true,
                            spacing: { before: 800, after: 600 },
                            run: { font: config.layout.headingFont, size: 32 }
                        }));
                    } else if (trimmed.startsWith('---') || trimmed === '* * *') {
                        children.push(new Paragraph({
                            text: config.layout.sceneDivider === 'line' ? '__________' : '❖',
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 400, after: 400 },
                            run: { font: config.layout.headingFont, size: 24 }
                        }));
                    } else if (!trimmed.startsWith('#')) {
                        children.push(new Paragraph({
                            children: [new TextRun({ 
                                text: trimmed, 
                                font: config.layout.bodyFont, 
                                size: config.layout.fontSize * 2 
                            })],
                            alignment: config.layout.alignment === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
                            spacing: { line: config.layout.lineHeight * 240, after: 200 }
                        }));
                    }
                });

                const doc = new Document({
                    sections: [{
                        properties: {
                            page: {
                                size: { width: paper.width * INCH_TO_TWIP, height: paper.height * INCH_TO_TWIP },
                                margin: { top: marginTwips, bottom: marginTwips, left: marginTwips, right: marginTwips }
                            }
                        },
                        headers: {
                            default: new Header({
                                children: config.layout.header === 'title-author' ? [
                                    new Paragraph({
                                        children: [new TextRun({ text: `${activeStory.title}  |  ${config.metadata.author}`, size: 16, color: "666666" })],
                                        alignment: AlignmentType.CENTER
                                    })
                                ] : []
                            })
                        },
                        footers: {
                            default: new Footer({
                                children: config.layout.footer === 'page-num' ? [
                                    new Paragraph({
                                        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })],
                                        alignment: AlignmentType.CENTER
                                    })
                                ] : []
                            })
                        },
                        children: children
                    }]
                });

                const blob = await Packer.toBlob(doc);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${activeStory.title.replace(/\s+/g, '_')}_Manuscript.docx`;
                a.click();
            } else {
                // PDF Export using basic jsPDF (Enhanced in real app with html2canvas or pdfmake)
                const doc = new jsPDF();
                doc.setFont("times");
                doc.setFontSize(24);
                doc.text(activeStory.title, 105, 50, { align: 'center' });
                doc.setFontSize(12);
                doc.text("Exported via Mythos Publisher", 105, 280, { align: 'center' });
                doc.save("manuscript.pdf");
            }
        } catch (e) {
            console.error(e);
            alert("Export failed");
        } finally {
            setIsExporting(false);
        }
    };

    if (!activeStory) return <div className="p-10 text-center text-gray-400">Please select a story to publish.</div>;

    const paper = PAPER_SIZES.find(p => p.id === config.paperSize) || PAPER_SIZES[1];
    const marginSize = MARGIN_MAP[config.margins || 'normal'];
    
    // CSS for Preview
    const previewWidth = paper.width * 96 * zoom;
    const previewHeight = paper.height * 96 * zoom;
    const previewMargin = marginSize * 96 * zoom;

    return (
        <div className="flex h-[calc(100vh-56px)] bg-[#0f172a] overflow-hidden">
            
            {/* LEFT SIDEBAR: CONTROLS */}
            <div className="w-[380px] bg-[#0a0f1c] border-r border-brand-800 flex flex-col z-20 flex-shrink-0 shadow-2xl">
                {/* Tab Header */}
                <div className="flex border-b border-brand-800">
                    {['LAYOUT', 'TYPOGRAPHY', 'CONTENT', 'COVER'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === tab ? 'border-brand-gold text-brand-gold bg-brand-800/30' : 'border-transparent text-gray-500 hover:text-white'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    
                    {activeTab === 'LAYOUT' && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Paper Size</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {PAPER_SIZES.map(p => (
                                        <button 
                                            key={p.id}
                                            onClick={() => setConfig({...config, paperSize: p.id as any})}
                                            className={`p-3 rounded-lg border text-left transition-all ${config.paperSize === p.id ? 'bg-brand-700 border-brand-gold text-white' : 'bg-brand-900 border-brand-700 text-gray-400 hover:border-gray-500'}`}
                                        >
                                            <span className="block font-bold text-sm">{p.id}</span>
                                            <span className="text-[10px] opacity-70">{p.width}" x {p.height}"</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Margins</label>
                                <div className="flex bg-brand-900 p-1 rounded-lg border border-brand-700">
                                    {['narrow', 'normal', 'wide'].map(m => (
                                        <button 
                                            key={m}
                                            onClick={() => setConfig({...config, margins: m as any})}
                                            className={`flex-1 py-2 text-xs font-bold capitalize rounded transition-colors ${config.margins === m ? 'bg-brand-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Header & Footer</label>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between p-3 bg-brand-900 rounded-lg border border-brand-700">
                                        <span className="text-sm text-gray-300">Running Head</span>
                                        <select 
                                            value={config.layout.header}
                                            onChange={(e) => setConfig({...config, layout: {...config.layout, header: e.target.value as any}})}
                                            className="bg-brand-800 text-xs text-white border border-brand-600 rounded px-2 py-1 outline-none"
                                        >
                                            <option value="none">None</option>
                                            <option value="title-author">Title / Author</option>
                                            <option value="chapter">Chapter Title</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-brand-900 rounded-lg border border-brand-700">
                                        <span className="text-sm text-gray-300">Page Numbers</span>
                                        <select 
                                            value={config.layout.footer}
                                            onChange={(e) => setConfig({...config, layout: {...config.layout, footer: e.target.value as any}})}
                                            className="bg-brand-800 text-xs text-white border border-brand-600 rounded px-2 py-1 outline-none"
                                        >
                                            <option value="none">None</option>
                                            <option value="page-num">Bottom Center</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'TYPOGRAPHY' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Font Pairing Cards */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Typeface Pairing</label>
                                <div className="space-y-2">
                                    <button 
                                        onClick={() => setConfig({...config, layout: {...config.layout, headingFont: 'Playfair Display', bodyFont: 'Merriweather'}})}
                                        className={`w-full p-3 rounded-lg border text-left transition-all ${config.layout.headingFont === 'Playfair Display' ? 'bg-brand-700 border-brand-gold' : 'bg-brand-900 border-brand-700 hover:border-gray-500'}`}
                                    >
                                        <h4 className="font-playfair text-lg text-white">The Classic</h4>
                                        <p className="font-serif text-xs text-gray-400">Playfair Display & Merriweather</p>
                                    </button>
                                    <button 
                                        onClick={() => setConfig({...config, layout: {...config.layout, headingFont: 'Cinzel', bodyFont: 'Lato'}})}
                                        className={`w-full p-3 rounded-lg border text-left transition-all ${config.layout.headingFont === 'Cinzel' ? 'bg-brand-700 border-brand-gold' : 'bg-brand-900 border-brand-700 hover:border-gray-500'}`}
                                    >
                                        <h4 className="font-cinzel text-lg text-white">The Epic</h4>
                                        <p className="font-lato text-xs text-gray-400">Cinzel & Lato</p>
                                    </button>
                                    <button 
                                        onClick={() => setConfig({...config, layout: {...config.layout, headingFont: 'Roboto', bodyFont: 'Roboto'}})}
                                        className={`w-full p-3 rounded-lg border text-left transition-all ${config.layout.headingFont === 'Roboto' ? 'bg-brand-700 border-brand-gold' : 'bg-brand-900 border-brand-700 hover:border-gray-500'}`}
                                    >
                                        <h4 className="font-roboto text-lg text-white">The Modern</h4>
                                        <p className="font-roboto text-xs text-gray-400">Roboto (Sans-Serif)</p>
                                    </button>
                                </div>
                            </div>

                            {/* Advanced Sliders */}
                            <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Base Size</label>
                                    <span className="text-xs text-brand-gold">{config.layout.fontSize}pt</span>
                                </div>
                                <input type="range" min="9" max="14" step="0.5" 
                                    value={config.layout.fontSize}
                                    onChange={(e) => setConfig({...config, layout: {...config.layout, fontSize: parseFloat(e.target.value)}})}
                                    className="w-full accent-brand-gold bg-brand-700 h-1 rounded-full appearance-none"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Line Height</label>
                                    <span className="text-xs text-brand-gold">{config.layout.lineHeight}</span>
                                </div>
                                <input type="range" min="1.0" max="2.0" step="0.1" 
                                    value={config.layout.lineHeight}
                                    onChange={(e) => setConfig({...config, layout: {...config.layout, lineHeight: parseFloat(e.target.value)}})}
                                    className="w-full accent-brand-gold bg-brand-700 h-1 rounded-full appearance-none"
                                />
                            </div>

                            {/* Toggles */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Alignment</label>
                                    <div className="flex bg-brand-900 rounded border border-brand-700 p-1">
                                        <button 
                                            onClick={() => setConfig({...config, layout: {...config.layout, alignment: 'left'}})}
                                            className={`flex-1 p-1 rounded ${config.layout.alignment === 'left' ? 'bg-brand-700 text-white' : 'text-gray-500'}`}
                                        >
                                            <span className="material-symbols-outlined text-sm">format_align_left</span>
                                        </button>
                                        <button 
                                            onClick={() => setConfig({...config, layout: {...config.layout, alignment: 'justify'}})}
                                            className={`flex-1 p-1 rounded ${config.layout.alignment === 'justify' ? 'bg-brand-700 text-white' : 'text-gray-500'}`}
                                        >
                                            <span className="material-symbols-outlined text-sm">format_align_justify</span>
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Drop Caps</label>
                                    <button 
                                        onClick={() => setConfig({...config, layout: {...config.layout, dropCaps: !config.layout.dropCaps}})}
                                        className={`w-full py-1.5 rounded border text-xs font-bold transition-all ${config.layout.dropCaps ? 'bg-brand-accent border-brand-accent text-white' : 'bg-brand-900 border-brand-700 text-gray-500'}`}
                                    >
                                        {config.layout.dropCaps ? 'Enabled' : 'Disabled'}
                                    </button>
                                </div>
                            </div>

                            {/* Scene Divider */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Scene Divider</label>
                                <div className="flex gap-2">
                                    {['asterisk', 'line', 'flourish', 'diamond'].map((d) => (
                                        <button 
                                            key={d}
                                            onClick={() => setConfig({...config, layout: {...config.layout, sceneDivider: d as any}})}
                                            className={`flex-1 py-2 rounded border transition-all ${config.layout.sceneDivider === d ? 'bg-brand-700 border-brand-gold text-white' : 'bg-brand-900 border-brand-700 text-gray-500'}`}
                                        >
                                            {d === 'asterisk' && '* * *'}
                                            {d === 'line' && '___'}
                                            {d === 'flourish' && '❖'}
                                            {d === 'diamond' && '♦'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'COVER' && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Cover Art Prompt</label>
                                <textarea 
                                    value={coverPrompt} 
                                    onChange={e => setCoverPrompt(e.target.value)}
                                    className="w-full bg-brand-900 border border-brand-700 rounded-lg p-3 text-white text-xs h-24 focus:border-brand-accent outline-none"
                                    placeholder="Describe the cover visual..."
                                />
                            </div>
                            <button 
                                onClick={handleGenerateCover}
                                disabled={isGeneratingCover}
                                className="w-full py-3 bg-gradient-to-r from-brand-gold to-yellow-600 text-brand-900 font-bold rounded-lg shadow-lg"
                            >
                                {isGeneratingCover ? 'Minting...' : 'Generate Art (AI)'}
                            </button>
                            {coverVariations.length > 0 && (
                                <div className="grid grid-cols-2 gap-2">
                                    {coverVariations.map((v, i) => (
                                        <img 
                                            key={i} 
                                            src={v} 
                                            onClick={() => setConfig({...config, coverImage: v})}
                                            className={`w-full aspect-[2/3] object-cover rounded cursor-pointer border-2 ${config.coverImage === v ? 'border-brand-gold' : 'border-transparent'}`} 
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-brand-800">
                    <button 
                        onClick={() => handleExport('DOCX')}
                        disabled={isExporting}
                        className="w-full py-3 bg-brand-accent hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2"
                    >
                        {isExporting ? <span className="animate-spin text-xl material-symbols-outlined">refresh</span> : <span className="material-symbols-outlined">download</span>}
                        Export Manuscript
                    </button>
                </div>
            </div>

            {/* MAIN PREVIEW AREA: THE PRINT DESK */}
            <div className="flex-1 relative bg-[#1e2330] flex flex-col overflow-hidden">
                {/* Desk Toolbar */}
                <div className="h-12 bg-[#0a0f1c] border-b border-brand-800 flex items-center justify-between px-4 z-30">
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Print Preview</span>
                        <div className="h-4 w-px bg-gray-700"></div>
                        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                            <input type="checkbox" checked={showGuides} onChange={() => setShowGuides(!showGuides)} />
                            Show Guides
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setZoom(Math.max(0.3, zoom - 0.1))} className="p-1 text-gray-400 hover:text-white"><span className="material-symbols-outlined">remove</span></button>
                        <span className="text-xs text-gray-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(Math.min(1.5, zoom + 0.1))} className="p-1 text-gray-400 hover:text-white"><span className="material-symbols-outlined">add</span></button>
                    </div>
                </div>

                {/* Scrollable Canvas */}
                <div className="flex-1 overflow-auto relative custom-scrollbar bg-[#18181b] shadow-inner p-10 flex justify-center">
                    
                    {/* Background Texture Overlay */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                    {/* Rulers */}
                    <div className="fixed top-[104px] left-[380px] right-0 h-8 z-20 overflow-hidden pointer-events-none">
                        <Ruler orientation="horizontal" length={Math.ceil(paper.width * 2)} scale={zoom} />
                    </div>
                    <div className="fixed top-[136px] left-[380px] bottom-0 w-8 z-20 overflow-hidden pointer-events-none">
                        <Ruler orientation="vertical" length={Math.ceil(paper.height * 2)} scale={zoom} />
                    </div>

                    {/* The Paper */}
                    <div 
                        className="relative bg-white shadow-2xl transition-all duration-200 origin-top mt-8 ml-8"
                        style={{
                            width: `${previewWidth}px`,
                            height: `${previewHeight}px`,
                            fontFamily: config.layout.bodyFont === 'Merriweather' ? 'Merriweather, serif' : config.layout.bodyFont,
                        }}
                    >
                        {/* Margins Overlay (Guides) */}
                        {showGuides && (
                            <div className="absolute inset-0 pointer-events-none border border-blue-400/30"
                                style={{
                                    top: `${previewMargin}px`,
                                    bottom: `${previewMargin}px`,
                                    left: `${previewMargin}px`,
                                    right: `${previewMargin}px`,
                                }}
                            ></div>
                        )}

                        {/* Paper Texture */}
                        <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply bg-noise"></div>

                        {/* Content Rendering (Preview of First Chapter) */}
                        <div 
                            className="absolute inset-0 overflow-hidden text-black"
                            style={{
                                top: `${previewMargin}px`,
                                bottom: `${previewMargin}px`,
                                left: `${previewMargin}px`,
                                right: `${previewMargin}px`,
                            }}
                        >
                            {/* Running Head */}
                            {config.layout.header !== 'none' && (
                                <div className="absolute top-[-20px] w-full text-center text-[10px] uppercase text-gray-400 font-sans tracking-widest">
                                    {config.layout.header === 'title-author' ? `${activeStory.title} • ${config.metadata.author}` : "Chapter 1"}
                                </div>
                            )}

                            {/* Render Text */}
                            <div style={{
                                fontSize: `${config.layout.fontSize * zoom}pt`,
                                lineHeight: config.layout.lineHeight,
                                textAlign: config.layout.alignment,
                                color: '#1a1a1a'
                            }}>
                                {/* Chapter Title */}
                                <div className="text-center mb-8 mt-4">
                                    <h2 
                                        className="font-bold leading-none mb-4" 
                                        style={{ 
                                            fontFamily: config.layout.headingFont, 
                                            fontSize: `${config.layout.fontSize * 2.5 * zoom}pt` 
                                        }}
                                    >
                                        Chapter One
                                    </h2>
                                </div>

                                {/* Body Text */}
                                {activeStory.content.split('\n').filter(l => !l.startsWith('#')).slice(0, 15).map((para, idx) => {
                                    if (!para.trim()) return <div key={idx} className="h-4"></div>;
                                    
                                    // Scene Divider Preview
                                    if (para.trim() === '---' || para.trim() === '* * *') {
                                        return (
                                            <div key={idx} className="text-center my-6 text-gray-800 text-xl font-serif">
                                                {config.layout.sceneDivider === 'asterisk' && '* * *'}
                                                {config.layout.sceneDivider === 'line' && '__________'}
                                                {config.layout.sceneDivider === 'flourish' && '❖'}
                                                {config.layout.sceneDivider === 'diamond' && '♦'}
                                            </div>
                                        )
                                    }

                                    // Drop Cap Logic
                                    if (idx === 0 && config.layout.dropCaps) {
                                        const firstLetter = para.charAt(0);
                                        const rest = para.slice(1);
                                        return (
                                            <p key={idx} className="mb-4">
                                                <span 
                                                    className="float-left mr-2 font-bold leading-[0.8]" 
                                                    style={{ 
                                                        fontFamily: config.layout.headingFont, 
                                                        fontSize: `${config.layout.fontSize * 3.8 * zoom}pt`,
                                                        marginTop: '-2px'
                                                    }}
                                                >
                                                    {firstLetter}
                                                </span>
                                                {rest}
                                            </p>
                                        )
                                    }

                                    return <p key={idx} className="mb-4">{para}</p>
                                })}
                            </div>

                            {/* Footer */}
                            {config.layout.footer === 'page-num' && (
                                <div className="absolute bottom-[-20px] w-full text-center text-xs font-serif text-gray-500">
                                    1
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .font-playfair { font-family: 'Playfair Display', serif; }
                .font-cinzel { font-family: 'Cinzel', serif; }
                .font-lato { font-family: 'Lato', sans-serif; }
                .font-roboto { font-family: 'Roboto', sans-serif; }
                .bg-noise { background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E"); }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #0a0f1c; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
            `}</style>
        </div>
    );
};
