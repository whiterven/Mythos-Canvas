
import React, { useState, useEffect, useRef } from 'react';
import { HistoryItem, PublishingConfig } from '../types';
import { generateImage, generateImageVariations } from '../services/geminiService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Footer, PageNumber, PageBreak } from "docx";
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
        fontSize: 12,
        dropCaps: true
    },
    metadata: {
        author: '',
        dedication: '',
        copyright: new Date().getFullYear().toString(),
        isbn: ''
    },
    coverResolution: '2K',
    backCoverBlurb: "A gripping tale that defies expectations. Dive into a world where mystery and emotion collide.",
    includeTOC: true,
    paperSize: '6x9',
    margins: 'normal',
    extraSections: []
};

const COVER_STYLES = [
    { id: 'Minimalist Vector', label: 'Minimalist' },
    { id: 'Cinematic Fantasy', label: 'Cinematic' },
    { id: 'Vintage Paperback', label: 'Vintage' },
    { id: 'Abstract Geometric', label: 'Abstract' },
    { id: 'Watercolor Art', label: 'Watercolor' },
    { id: 'Dark Horror', label: 'Dark Horror' },
    { id: 'Cyberpunk Neon', label: 'Cyberpunk' },
    { id: 'Oil Painting', label: 'Classic Oil' }
];

const FONTS = [
    { name: 'Merriweather', type: 'Serif (Classic)' },
    { name: 'Playfair Display', type: 'Display Serif' },
    { name: 'EB Garamond', type: 'Serif (Elegant)' },
    { name: 'Georgia', type: 'Serif (Web Safe)' },
    { name: 'Times New Roman', type: 'Serif (Standard)' },
    { name: 'Cinzel', type: 'Cinematic' },
    { name: 'Inter', type: 'Sans-Serif' },
    { name: 'Lato', type: 'Modern Sans' },
    { name: 'Verdana', type: 'Sans (Web Safe)' },
    { name: 'Courier New', type: 'Monospace' },
];

const PAPER_SIZES = [
    { id: '5x8', label: '5" x 8" (Pocket)', width: 5, height: 8 },
    { id: '6x9', label: '6" x 9" (Trade)', width: 6, height: 9 },
    { id: 'A5', label: 'A5 (International)', width: 5.83, height: 8.27 },
    { id: 'A4', label: 'A4 (Standard)', width: 8.27, height: 11.69 },
    { id: 'Letter', label: 'US Letter', width: 8.5, height: 11 },
];

// Map margins to rem padding for preview
const MARGIN_MAP = {
    narrow: '2.5rem', // 0.5 inch approx
    normal: '3.75rem', // 0.75 inch approx
    wide: '5rem', // 1 inch approx
};

// Map margins to TWIPs for DOCX (1 inch = 1440 TWIPs)
const MARGIN_TWIPS = {
    narrow: 720,
    normal: 1440,
    wide: 2160
};

// Map Paper Sizes to TWIPs
const PAPER_TWIPS: Record<string, { width: number, height: number }> = {
    '5x8': { width: 5 * 1440, height: 8 * 1440 },
    '6x9': { width: 6 * 1440, height: 9 * 1440 },
    'A5': { width: 8391, height: 11906 },
    'A4': { width: 11906, height: 16838 },
    'Letter': { width: 12240, height: 15840 }
};

export const PublisherStudio: React.FC<Props> = ({ activeStoryId, history, onUpdateStory, onSelectStory }) => {
    const [activeTab, setActiveTab] = useState<'METADATA' | 'COVER' | 'MANUSCRIPT' | 'DESIGN' | 'EXPORT'>('METADATA');
    const [config, setConfig] = useState<PublishingConfig>(DEFAULT_CONFIG);
    const [isGeneratingCover, setIsGeneratingCover] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [coverPrompt, setCoverPrompt] = useState('');
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
    const [previewSide, setPreviewSide] = useState<'FRONT' | 'BACK' | 'SPREAD'>('FRONT');
    const [coverVariations, setCoverVariations] = useState<string[]>([]);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const activeStory = history.find(h => h.id === activeStoryId);

    // Initialize config from story
    useEffect(() => {
        if (activeStory) {
            setConfig(activeStory.publishingConfig || {
                ...DEFAULT_CONFIG,
                metadata: { ...DEFAULT_CONFIG.metadata, author: 'Unknown Author' },
                backCoverBlurb: activeStory.excerpt || DEFAULT_CONFIG.backCoverBlurb
            });
            setCoverPrompt(activeStory.config.corePremise || `A book about ${activeStory.title}`);
        }
    }, [activeStoryId, activeStory]);

    // Auto-save changes
    useEffect(() => {
        if (activeStoryId && activeStory) {
            if (JSON.stringify(activeStory.publishingConfig) !== JSON.stringify(config)) {
                const timer = setTimeout(() => {
                    onUpdateStory(activeStoryId, { publishingConfig: config });
                }, 1000);
                return () => clearTimeout(timer);
            }
        }
    }, [config, activeStoryId]);

    const handleGenerateCover = async () => {
        setIsGeneratingCover(true);
        setCoverVariations([]);
        try {
            const style = config.coverStyle || 'Cinematic Fantasy';
            const prompt = `Book cover art for a novel titled "${activeStory?.title}". Concept: ${coverPrompt}. Style: ${style}. No text, high quality, professional illustration.`;
            
            // Use Gemini 3 Pro for high quality covers with size support
            const variations = await generateImageVariations(prompt, { 
                aspectRatio: "2:3", 
                model: "gemini-3-pro-image-preview", 
                imageSize: config.coverResolution || '2K' 
            }, 4);
            
            setCoverVariations(variations);
            // Default to first one if none selected
            if (!config.coverImage) {
                setConfig(prev => ({ ...prev, coverImage: variations[0] }));
            }
            setPreviewSide('FRONT');
        } catch (e) {
            alert("Failed to generate cover. Ensure you have selected a valid API key if using premium models.");
        } finally {
            setIsGeneratingCover(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target?.result as string;
                setConfig(prev => ({ ...prev, coverImage: result }));
                setCoverVariations([]); // Clear variations if custom upload
            };
            reader.readAsDataURL(file);
        }
    };

    const addExtraSection = (type: 'preface' | 'epilogue' | 'custom', customTitle = 'New Section') => {
        const newSection = {
            id: Date.now().toString(),
            title: type === 'preface' ? 'Preface' : type === 'epilogue' ? 'Epilogue' : customTitle,
            content: 'Start writing here...',
            type
        };
        setConfig(prev => ({
            ...prev,
            extraSections: [...prev.extraSections, newSection]
        }));
        setSelectedSectionId(newSection.id);
    };

    const moveSection = (id: string, direction: 'up' | 'down') => {
        const index = config.extraSections.findIndex(s => s.id === id);
        if (index === -1) return;
        
        const newSections = [...config.extraSections];
        if (direction === 'up' && index > 0) {
            [newSections[index], newSections[index - 1]] = [newSections[index - 1], newSections[index]];
        } else if (direction === 'down' && index < newSections.length - 1) {
            [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]];
        }
        setConfig(prev => ({ ...prev, extraSections: newSections }));
    };

    const updateSection = (id: string, updates: any) => {
        setConfig(prev => ({
            ...prev,
            extraSections: prev.extraSections.map(s => s.id === id ? { ...s, ...updates } : s)
        }));
    };

    const deleteSection = (id: string) => {
        setConfig(prev => ({
            ...prev,
            extraSections: prev.extraSections.filter(s => s.id !== id)
        }));
        if (selectedSectionId === id) setSelectedSectionId(null);
    };

    const getFontClass = (fontName: string) => {
        if (fontName.includes('Playfair')) return 'font-playfair';
        if (fontName.includes('Cinzel')) return 'font-cinzel';
        if (fontName.includes('Lato')) return 'font-lato';
        if (fontName.includes('Inter')) return 'font-sans';
        if (fontName.includes('Garamond')) return 'font-garamond';
        if (fontName.includes('Roboto')) return 'font-roboto';
        // System fonts fallback
        if (fontName.includes('Georgia')) return 'font-serif';
        if (fontName.includes('Times')) return 'font-serif';
        if (fontName.includes('Courier')) return 'font-mono';
        if (fontName.includes('Verdana')) return 'font-sans';
        return 'font-serif';
    };

    // Helper to get raw font family string for CSS styles
    const getFontFamily = (fontName: string) => {
        if (fontName.includes('Playfair')) return '"Playfair Display", serif';
        if (fontName.includes('Cinzel')) return 'Cinzel, serif';
        if (fontName.includes('Lato')) return 'Lato, sans-serif';
        if (fontName.includes('Inter')) return 'Inter, sans-serif';
        if (fontName.includes('Garamond')) return '"EB Garamond", serif';
        if (fontName.includes('Roboto')) return 'Roboto, sans-serif';
        if (fontName.includes('Georgia')) return 'Georgia, serif';
        if (fontName.includes('Times')) return '"Times New Roman", serif';
        if (fontName.includes('Courier')) return '"Courier New", monospace';
        if (fontName.includes('Verdana')) return 'Verdana, sans-serif';
        return 'Merriweather, serif';
    };

    const getPaperDimensions = () => {
        const paper = PAPER_SIZES.find(p => p.id === config.paperSize) || PAPER_SIZES[1]; // Default 6x9
        return { width: paper.width, height: paper.height };
    };

    const extractChapters = () => {
        if (!activeStory?.content) return [];
        const matches = activeStory.content.match(/^##\s+(.*)$/gm);
        if (!matches) return [];
        return matches.map((m, i) => ({ title: m.replace(/^##\s+/, ''), page: i * 5 + 3 })); // Fake page estimation
    };

    const handleExport = (format: 'PDF' | 'DOCX') => {
        if (!activeStory) return;
        setIsExporting(true);
        setTimeout(async () => {
            try {
                if (format === 'DOCX') {
                    const children: any[] = [];

                    // 1. Title Page
                    children.push(
                        new Paragraph({
                            text: activeStory.title || "Untitled",
                            heading: HeadingLevel.TITLE,
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 4000, after: 1000 },
                            run: { font: config.layout.headingFont }
                        }),
                        new Paragraph({
                            text: `By ${config.metadata.author}`,
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 4000 },
                            run: { font: config.layout.bodyFont, size: 28 } // 14pt
                        }),
                        new Paragraph({
                            text: config.metadata.dedication ? `"${config.metadata.dedication}"` : "",
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 2000, after: 2000 },
                            run: { font: config.layout.bodyFont, italics: true }
                        }),
                        new Paragraph({
                            text: `Copyright © ${config.metadata.copyright} ${config.metadata.author}`,
                            alignment: AlignmentType.CENTER,
                            run: { font: config.layout.bodyFont, size: 20 }
                        }),
                        new Paragraph({
                            children: [new PageBreak()]
                        })
                    );

                    // 2. Front Matter (Foreword, Preface, etc.)
                    config.extraSections.filter(s => s.type === 'preface').forEach(s => {
                        children.push(
                            new Paragraph({
                                text: s.title,
                                heading: HeadingLevel.HEADING_1,
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 400 },
                                run: { font: config.layout.headingFont }
                            }),
                            ...s.content.split('\n').map(line => new Paragraph({ 
                                children: [new TextRun({ text: line, font: config.layout.bodyFont, size: config.layout.fontSize * 2 })],
                                spacing: { after: 240 } 
                            })),
                            new Paragraph({ children: [new PageBreak()] })
                        );
                    });

                    // 3. Table of Contents
                    if (config.includeTOC) {
                        children.push(
                            new Paragraph({
                                text: "Table of Contents",
                                heading: HeadingLevel.HEADING_1,
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 400 },
                                run: { font: config.layout.headingFont }
                            })
                        );
                        // Manually build TOC for reliability
                        const chapters = activeStory.content.match(/^##\s+(.*)$/gm);
                        if(chapters) {
                            chapters.forEach(ch => {
                                children.push(new Paragraph({ 
                                    text: ch.replace('## ', ''), 
                                    spacing: { after: 200 },
                                    run: { font: config.layout.bodyFont, size: config.layout.fontSize * 2 }
                                }));
                            });
                        }
                        children.push(new Paragraph({ children: [new PageBreak()] }));
                    }

                    // 4. Main Content (Chapters)
                    const lines = activeStory.content.split('\n');
                    let lastWasChapterHeading = false;

                    lines.forEach(line => {
                        const trimmed = line.trim();
                        if (!trimmed) return;

                        if (trimmed.startsWith('# ')) {
                            // Skip main title as we generated a title page
                        } else if (trimmed.startsWith('## ')) {
                            children.push(new Paragraph({
                                text: trimmed.replace('## ', ''),
                                heading: HeadingLevel.HEADING_2,
                                alignment: AlignmentType.CENTER,
                                pageBreakBefore: true,
                                spacing: { before: 800, after: 400 },
                                run: { font: config.layout.headingFont }
                            }));
                            lastWasChapterHeading = true;
                        } else if (trimmed.startsWith('### ')) {
                            children.push(new Paragraph({
                                text: trimmed.replace('### ', ''),
                                heading: HeadingLevel.HEADING_3,
                                spacing: { before: 400, after: 200 },
                                run: { font: config.layout.headingFont }
                            }));
                            lastWasChapterHeading = false;
                        } else {
                            // Regular Paragraph
                            const runs = [];
                            if (lastWasChapterHeading && config.layout.dropCaps && trimmed.length > 0) {
                                // Simulate Drop Cap with larger first letter
                                const firstChar = trimmed.charAt(0);
                                const rest = trimmed.slice(1);
                                runs.push(
                                    new TextRun({
                                        text: firstChar,
                                        font: config.layout.headingFont,
                                        size: config.layout.fontSize * 2 * 3.5, // ~3.5x size
                                        bold: true
                                    }),
                                    new TextRun({
                                        text: rest,
                                        font: config.layout.bodyFont,
                                        size: config.layout.fontSize * 2
                                    })
                                );
                                lastWasChapterHeading = false;
                            } else {
                                runs.push(new TextRun({
                                    text: trimmed,
                                    font: config.layout.bodyFont,
                                    size: config.layout.fontSize * 2
                                }));
                            }

                            children.push(new Paragraph({
                                children: runs,
                                spacing: { after: 240 },
                                alignment: AlignmentType.JUSTIFIED
                            }));
                        }
                    });

                    // 5. Back Matter
                    config.extraSections.filter(s => s.type !== 'preface').forEach(s => {
                        children.push(
                            new Paragraph({
                                children: [new PageBreak()],
                            }),
                            new Paragraph({
                                text: s.title,
                                heading: HeadingLevel.HEADING_1,
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 400 },
                                run: { font: config.layout.headingFont }
                            }),
                            ...s.content.split('\n').map(line => new Paragraph({ 
                                children: [new TextRun({ text: line, font: config.layout.bodyFont, size: config.layout.fontSize * 2 })],
                                spacing: { after: 240 } 
                            }))
                        );
                    });

                    const doc = new Document({
                        styles: {
                            default: {
                                heading1: { run: { font: config.layout.headingFont, size: 48, bold: true, color: "000000" } },
                                heading2: { run: { font: config.layout.headingFont, size: 36, bold: true, color: "000000" } },
                                heading3: { run: { font: config.layout.headingFont, size: 28, bold: true, color: "333333" } },
                            }
                        },
                        sections: [{
                            properties: {
                                page: {
                                    size: PAPER_TWIPS[config.paperSize || '6x9'],
                                    margin: {
                                        top: MARGIN_TWIPS[config.margins || 'normal'],
                                        right: MARGIN_TWIPS[config.margins || 'normal'],
                                        bottom: MARGIN_TWIPS[config.margins || 'normal'],
                                        left: MARGIN_TWIPS[config.margins || 'normal']
                                    }
                                }
                            },
                            children: children,
                            footers: {
                                default: new Footer({
                                    children: [
                                        new Paragraph({
                                            alignment: AlignmentType.CENTER,
                                            children: [
                                                new TextRun({
                                                    children: ["- ", PageNumber.CURRENT, " -"],
                                                    font: config.layout.bodyFont,
                                                    size: 20
                                                }),
                                            ],
                                        }),
                                    ],
                                }),
                            },
                        }]
                    });

                    const blob = await Packer.toBlob(doc);
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${activeStory?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'book'}.docx`;
                    a.click();
                } else {
                    // PDF Export (Simplified Existing Logic)
                    const doc = new jsPDF();
                    doc.setFont("times");
                    doc.text(activeStory?.title || "Untitled", 10, 20);
                    doc.text(`By ${config.metadata.author}`, 10, 30);
                    const lines = doc.splitTextToSize(activeStory?.content || "", 180);
                    doc.text(lines, 10, 50);
                    doc.save(`${activeStory?.title || 'book'}.pdf`);
                }
            } catch(e) {
                console.error(e);
                alert("Export failed");
            } finally {
                setIsExporting(false);
            }
        }, 100);
    };

    if (!activeStory) {
        return (
            <div className="max-w-6xl mx-auto p-8 animate-fade-in">
                <h2 className="text-3xl font-serif text-white mb-8">Publisher Studio</h2>
                <div className="text-center py-20 bg-brand-800 rounded-2xl border border-brand-700">
                    <p className="text-gray-400">No stories available to publish. Create one first.</p>
                </div>
            </div>
        );
    }

    const chapters = extractChapters();
    const paperDims = getPaperDimensions();
    // Calculate aspect ratio for container
    const paperAspectRatio = paperDims.width / paperDims.height;

    return (
        <div className="flex h-[calc(100vh-60px)] bg-[#0f172a] overflow-hidden">
            {/* Sidebar */}
            <div className="w-20 bg-[#0a0f1c] border-r border-brand-800 flex flex-col items-center py-6 gap-6 z-20">
                {[
                    { id: 'METADATA', icon: 'info', label: 'Meta' },
                    { id: 'COVER', icon: 'book_2', label: 'Cover' },
                    { id: 'MANUSCRIPT', icon: 'article', label: 'Content' },
                    { id: 'DESIGN', icon: 'format_paint', label: 'Design' },
                    { id: 'EXPORT', icon: 'publish', label: 'Publish' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 group ${activeTab === tab.id ? 'bg-brand-800 text-brand-gold' : 'text-gray-500 hover:text-white'}`}
                    >
                        <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">{tab.icon}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Workbench */}
            <div className="w-[420px] bg-brand-900 border-r border-brand-800 flex flex-col overflow-hidden z-10 flex-shrink-0 shadow-xl">
                <div className="p-6 border-b border-brand-800 bg-[#0a0f1c]">
                    <h3 className="text-xl font-bold text-white font-serif tracking-tight">
                        {activeTab === 'METADATA' && 'Book Metadata'}
                        {activeTab === 'COVER' && 'Cover Designer'}
                        {activeTab === 'MANUSCRIPT' && 'Manuscript Manager'}
                        {activeTab === 'DESIGN' && 'Typography & Layout'}
                        {activeTab === 'EXPORT' && 'Export & Publish'}
                    </h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {/* METADATA */}
                    {activeTab === 'METADATA' && (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Book Title</label>
                                <input 
                                    type="text" 
                                    value={activeStory.title} 
                                    readOnly 
                                    className="w-full bg-brand-800 border border-brand-700 rounded-lg p-3 text-gray-400 cursor-not-allowed" 
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Author Name</label>
                                <input 
                                    type="text" 
                                    value={config.metadata.author} 
                                    onChange={e => setConfig({...config, metadata: {...config.metadata, author: e.target.value}})}
                                    className="w-full bg-brand-800 border border-brand-700 rounded-lg p-3 text-white focus:border-brand-accent outline-none" 
                                    placeholder="Pen name"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Dedication</label>
                                <textarea 
                                    value={config.metadata.dedication} 
                                    onChange={e => setConfig({...config, metadata: {...config.metadata, dedication: e.target.value}})}
                                    className="w-full bg-brand-800 border border-brand-700 rounded-lg p-3 text-white focus:border-brand-accent outline-none h-24 resize-none" 
                                    placeholder="To my muse..."
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Copyright Year</label>
                                <input 
                                    type="text" 
                                    value={config.metadata.copyright} 
                                    onChange={e => setConfig({...config, metadata: {...config.metadata, copyright: e.target.value}})}
                                    className="w-full bg-brand-800 border border-brand-700 rounded-lg p-3 text-white focus:border-brand-accent outline-none" 
                                />
                            </div>
                        </div>
                    )}

                    {/* COVER */}
                    {activeTab === 'COVER' && (
                        <div className="space-y-6">
                            {/* Preview Actions */}
                            <div className="flex bg-brand-800 rounded-lg p-1 border border-brand-700">
                                <button 
                                    onClick={() => setPreviewSide('FRONT')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${previewSide === 'FRONT' ? 'bg-brand-700 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Front
                                </button>
                                <button 
                                    onClick={() => setPreviewSide('BACK')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${previewSide === 'BACK' ? 'bg-brand-700 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Back
                                </button>
                                <button 
                                    onClick={() => setPreviewSide('SPREAD')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${previewSide === 'SPREAD' ? 'bg-brand-700 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Spread
                                </button>
                            </div>

                            {/* Front Settings */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Generation Prompt</label>
                                <textarea 
                                    value={coverPrompt} 
                                    onChange={e => setCoverPrompt(e.target.value)}
                                    className="w-full bg-brand-800 border border-brand-700 rounded-lg p-3 text-white focus:border-brand-accent outline-none h-24 resize-none text-sm leading-relaxed" 
                                    placeholder="Describe the cover art..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Style</label>
                                    <select 
                                        value={config.coverStyle}
                                        onChange={(e) => setConfig({...config, coverStyle: e.target.value})}
                                        className="w-full bg-brand-800 border border-brand-700 rounded-lg p-2 text-white text-xs focus:border-brand-accent outline-none"
                                    >
                                        {COVER_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Resolution</label>
                                    <select 
                                        value={config.coverResolution || '2K'}
                                        onChange={(e) => setConfig({...config, coverResolution: e.target.value as any})}
                                        className="w-full bg-brand-800 border border-brand-700 rounded-lg p-2 text-white text-xs focus:border-brand-accent outline-none"
                                    >
                                        <option value="1K">Standard (1K)</option>
                                        <option value="2K">High (2K)</option>
                                        <option value="4K">Ultra (4K)</option>
                                    </select>
                                </div>
                            </div>

                            <button 
                                onClick={handleGenerateCover}
                                disabled={isGeneratingCover}
                                className="w-full py-4 bg-gradient-to-r from-brand-gold to-yellow-500 hover:from-yellow-400 hover:to-yellow-500 text-brand-900 font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20 active:scale-95"
                            >
                                {isGeneratingCover ? (
                                    <div className="flex items-center gap-2">
                                        <span className="w-4 h-4 border-2 border-brand-900 border-t-transparent rounded-full animate-spin"></span>
                                        <span>Minting Variations...</span>
                                    </div>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">auto_awesome</span>
                                        Mint Cover Art
                                    </>
                                )}
                            </button>

                            {/* Variations Grid */}
                            {coverVariations.length > 0 && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {coverVariations.map((src, i) => (
                                        <div 
                                            key={i} 
                                            onClick={() => setConfig(prev => ({ ...prev, coverImage: src }))}
                                            className={`aspect-[2/3] rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${config.coverImage === src ? 'border-brand-gold ring-2 ring-brand-gold/30' : 'border-transparent hover:border-gray-500'}`}
                                        >
                                            <img src={src} alt={`Variation ${i+1}`} className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="text-center border-t border-brand-800 pt-4">
                                <p className="text-xs text-gray-500 mb-2">Or upload your own</p>
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    ref={coverInputRef}
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                                <button 
                                    onClick={() => coverInputRef.current?.click()}
                                    className="text-xs bg-brand-800 hover:bg-brand-700 text-gray-300 px-4 py-2 rounded-lg border border-brand-700 transition-colors"
                                >
                                    Upload Image
                                </button>
                            </div>

                            {/* Back Cover Settings */}
                            <div className="pt-6 border-t border-brand-800">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Back Cover Blurb</label>
                                <textarea 
                                    value={config.backCoverBlurb} 
                                    onChange={e => setConfig({...config, backCoverBlurb: e.target.value})}
                                    className="w-full bg-brand-800 border border-brand-700 rounded-lg p-3 text-white focus:border-brand-accent outline-none h-32 resize-none text-sm leading-relaxed" 
                                    placeholder="Write a compelling summary..."
                                />
                            </div>
                        </div>
                    )}

                    {/* MANUSCRIPT MODULE */}
                    {activeTab === 'MANUSCRIPT' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-3 bg-brand-800 rounded-lg border border-brand-700">
                                <label className="text-sm font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-brand-gold">list</span>
                                    Include Table of Contents
                                </label>
                                <button 
                                    onClick={() => setConfig({...config, includeTOC: !config.includeTOC})}
                                    className={`w-12 h-6 rounded-full relative transition-colors ${config.includeTOC ? 'bg-brand-accent' : 'bg-gray-700'}`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${config.includeTOC ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                </button>
                            </div>

                            {/* Front Matter */}
                            <div className="bg-brand-800 rounded-xl p-4 border border-brand-700">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Front Matter</h4>
                                    <div className="flex gap-1">
                                        <button onClick={() => addExtraSection('preface', 'Foreword')} className="text-[10px] bg-brand-900 px-2 py-1 rounded text-gray-400 hover:text-white">Foreword</button>
                                        <button onClick={() => addExtraSection('preface', 'Preface')} className="text-[10px] bg-brand-900 px-2 py-1 rounded text-gray-400 hover:text-white">Preface</button>
                                        <button onClick={() => addExtraSection('preface', 'Introduction')} className="text-[10px] bg-brand-900 px-2 py-1 rounded text-gray-400 hover:text-white">Intro</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {config.extraSections.filter(s => s.type === 'preface').map(s => (
                                        <div key={s.id} onClick={() => setSelectedSectionId(s.id)} className={`p-3 rounded-lg border cursor-pointer flex justify-between items-center group ${selectedSectionId === s.id ? 'bg-brand-700 border-brand-accent' : 'bg-brand-900 border-brand-800 hover:border-gray-600'}`}>
                                            <span className="text-sm font-medium text-white">{s.title}</span>
                                            <div className="flex items-center gap-1">
                                                <button onClick={(e) => { e.stopPropagation(); moveSection(s.id, 'up')}} className="text-gray-600 hover:text-white"><span className="material-symbols-outlined text-xs">arrow_upward</span></button>
                                                <button onClick={(e) => { e.stopPropagation(); moveSection(s.id, 'down')}} className="text-gray-600 hover:text-white"><span className="material-symbols-outlined text-xs">arrow_downward</span></button>
                                                <button onClick={(e) => { e.stopPropagation(); deleteSection(s.id); }} className="text-gray-600 hover:text-red-400 ml-1"><span className="material-symbols-outlined text-xs">close</span></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Body */}
                            <div className="bg-brand-800 rounded-xl p-4 border border-brand-700">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Body Content</h4>
                                <div className="p-3 bg-brand-900 rounded-lg border border-brand-800 opacity-70">
                                    <span className="text-sm text-gray-400 italic">Main Story Content ({activeStory.content.length} chars)</span>
                                </div>
                            </div>

                            {/* Back Matter */}
                            <div className="bg-brand-800 rounded-xl p-4 border border-brand-700">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Back Matter</h4>
                                    <div className="flex gap-1">
                                        <button onClick={() => addExtraSection('epilogue', 'Epilogue')} className="text-[10px] bg-brand-900 px-2 py-1 rounded text-gray-400 hover:text-white">Epilogue</button>
                                        <button onClick={() => addExtraSection('epilogue', 'Acknowledgements')} className="text-[10px] bg-brand-900 px-2 py-1 rounded text-gray-400 hover:text-white">Ack</button>
                                        <button onClick={() => addExtraSection('epilogue', 'Appendix')} className="text-[10px] bg-brand-900 px-2 py-1 rounded text-gray-400 hover:text-white">Appendix</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {config.extraSections.filter(s => s.type === 'epilogue' || s.type === 'custom').map(s => (
                                        <div key={s.id} onClick={() => setSelectedSectionId(s.id)} className={`p-3 rounded-lg border cursor-pointer flex justify-between items-center ${selectedSectionId === s.id ? 'bg-brand-700 border-brand-accent' : 'bg-brand-900 border-brand-800 hover:border-gray-600'}`}>
                                            <span className="text-sm font-medium text-white">{s.title}</span>
                                            <div className="flex items-center gap-1">
                                                <button onClick={(e) => { e.stopPropagation(); moveSection(s.id, 'up')}} className="text-gray-600 hover:text-white"><span className="material-symbols-outlined text-xs">arrow_upward</span></button>
                                                <button onClick={(e) => { e.stopPropagation(); moveSection(s.id, 'down')}} className="text-gray-600 hover:text-white"><span className="material-symbols-outlined text-xs">arrow_downward</span></button>
                                                <button onClick={(e) => { e.stopPropagation(); deleteSection(s.id); }} className="text-gray-600 hover:text-red-400 ml-1"><span className="material-symbols-outlined text-xs">close</span></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {selectedSectionId && (
                                <div className="pt-4 border-t border-brand-700 animate-fade-in">
                                    <input 
                                        type="text" 
                                        value={config.extraSections.find(s => s.id === selectedSectionId)?.title || ''}
                                        onChange={(e) => updateSection(selectedSectionId, { title: e.target.value })}
                                        className="w-full bg-transparent text-white font-bold mb-2 focus:outline-none border-b border-brand-700 focus:border-brand-accent pb-1"
                                    />
                                    <textarea 
                                        value={config.extraSections.find(s => s.id === selectedSectionId)?.content || ''}
                                        onChange={(e) => updateSection(selectedSectionId, { content: e.target.value })}
                                        className="w-full h-64 bg-brand-800 rounded-lg p-3 text-sm text-gray-300 focus:outline-none resize-none"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* DESIGN MODULE */}
                    {activeTab === 'DESIGN' && (
                        <div className="space-y-6">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Paper Size</label>
                                <select 
                                    value={config.paperSize || '6x9'}
                                    onChange={(e) => setConfig({...config, paperSize: e.target.value as any})}
                                    className="w-full bg-brand-800 border border-brand-700 rounded-lg p-3 text-white focus:border-brand-accent outline-none appearance-none"
                                >
                                    {PAPER_SIZES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Margins</label>
                                <div className="flex bg-brand-800 p-1 rounded-lg border border-brand-700">
                                    {['narrow', 'normal', 'wide'].map(m => (
                                        <button 
                                            key={m}
                                            onClick={() => setConfig({...config, margins: m as any})}
                                            className={`flex-1 py-2 rounded text-xs capitalize font-medium transition-colors ${config.margins === m ? 'bg-brand-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Heading Font</label>
                                <select 
                                    value={config.layout.headingFont}
                                    onChange={(e) => setConfig({...config, layout: {...config.layout, headingFont: e.target.value}})}
                                    className="w-full bg-brand-800 border border-brand-700 rounded-lg p-3 text-white focus:border-brand-accent outline-none appearance-none"
                                >
                                    {FONTS.map(f => <option key={f.name} value={f.name}>{f.name} ({f.type})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Body Font</label>
                                <select 
                                    value={config.layout.bodyFont}
                                    onChange={(e) => setConfig({...config, layout: {...config.layout, bodyFont: e.target.value}})}
                                    className="w-full bg-brand-800 border border-brand-700 rounded-lg p-3 text-white focus:border-brand-accent outline-none appearance-none"
                                >
                                    {FONTS.map(f => <option key={f.name} value={f.name}>{f.name} ({f.type})</option>)}
                                </select>
                            </div>
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Base Size</label>
                                    <span className="text-xs text-brand-gold">{config.layout.fontSize}pt</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="10" max="18" step="1"
                                    value={config.layout.fontSize}
                                    onChange={(e) => setConfig({...config, layout: {...config.layout, fontSize: parseInt(e.target.value)}})}
                                    className="w-full accent-brand-accent"
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 bg-brand-800 rounded-lg border border-brand-700">
                                <label className="text-sm font-bold text-white">Drop Caps</label>
                                <button 
                                    onClick={() => setConfig({...config, layout: {...config.layout, dropCaps: !config.layout.dropCaps}})}
                                    className={`w-12 h-6 rounded-full relative transition-colors ${config.layout.dropCaps ? 'bg-brand-accent' : 'bg-gray-700'}`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${config.layout.dropCaps ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* EXPORT MODULE */}
                    {activeTab === 'EXPORT' && (
                        <div className="space-y-6 flex flex-col justify-center h-full">
                            <div className="text-center mb-6">
                                <span className="material-symbols-outlined text-6xl text-brand-gold mb-4">print</span>
                                <h3 className="text-2xl font-serif text-white mb-2">Ready to Publish?</h3>
                                <p className="text-sm text-gray-400">Your book is compiled and ready for distribution.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <button 
                                    onClick={() => handleExport('PDF')}
                                    disabled={isExporting}
                                    className="flex items-center justify-between p-4 bg-brand-800 hover:bg-brand-700 border border-brand-700 rounded-xl group transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">
                                            <span className="material-symbols-outlined">picture_as_pdf</span>
                                        </div>
                                        <div className="text-left">
                                            <h4 className="font-bold text-white group-hover:text-red-400 transition-colors">Print PDF</h4>
                                            <p className="text-xs text-gray-500">High-fidelity print ready</p>
                                        </div>
                                    </div>
                                    <span className="material-symbols-outlined text-gray-500 group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                                </button>
                                <button 
                                    onClick={() => handleExport('DOCX')}
                                    disabled={isExporting}
                                    className="flex items-center justify-between p-4 bg-brand-800 hover:bg-brand-700 border border-brand-700 rounded-xl group transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                                            <span className="material-symbols-outlined">description</span>
                                        </div>
                                        <div className="text-left">
                                            <h4 className="font-bold text-white group-hover:text-blue-400 transition-colors">Manuscript DOCX</h4>
                                            <p className="text-xs text-gray-500">Editable Word document</p>
                                        </div>
                                    </div>
                                    <span className="material-symbols-outlined text-gray-500 group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 3. The Proof (Right Preview) */}
            <div className="flex-1 bg-[#1e2330] flex items-center justify-center p-8 overflow-hidden relative">
                <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                
                {/* Book Preview Container */}
                <div 
                    className={`relative transition-all duration-500 ${previewSide === 'SPREAD' ? 'w-[90%] aspect-[2/1.414]' : 'h-[90vh]'}`}
                    style={previewSide !== 'SPREAD' ? { aspectRatio: `${paperDims.width}/${paperDims.height}` } : {}}
                >
                    <div className={`bg-white text-black h-full w-full shadow-2xl overflow-y-auto relative custom-scrollbar-light transition-all duration-300 ${previewSide === 'SPREAD' ? 'flex' : ''}`}>
                        
                        {activeTab === 'COVER' ? (
                            <>
                                {previewSide === 'FRONT' && (
                                    <div className="w-full h-full relative bg-gray-100 flex flex-col">
                                        {config.coverImage ? (
                                            <img src={config.coverImage} alt="Cover" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#f4ecd8]">
                                                <h1 className={`text-5xl mb-4 font-bold`} style={{ fontFamily: getFontFamily(config.layout.headingFont) }}>{activeStory.title}</h1>
                                                <p className={`text-xl italic`} style={{ fontFamily: getFontFamily(config.layout.bodyFont) }}>By {config.metadata.author || "Author"}</p>
                                            </div>
                                        )}
                                        {/* Text Overlay Layer */}
                                        {!config.coverImage && (
                                            <div className="absolute bottom-12 w-full text-center">
                                                <p className="uppercase tracking-[0.3em] text-xs font-bold text-gray-500">A Mythos Original</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {previewSide === 'BACK' && (
                                    <div className="w-full h-full relative bg-[#1a1a1a] flex flex-col p-12 text-white">
                                        <div className="flex-1 flex flex-col justify-center items-center text-center">
                                            <div className="mb-8 w-16 h-1 bg-brand-gold opacity-50"></div>
                                            <p className={`text-lg md:text-xl leading-loose`} style={{ fontFamily: getFontFamily(config.layout.bodyFont) }}>
                                                "{config.backCoverBlurb}"
                                            </p>
                                            <div className="mt-8 w-16 h-1 bg-brand-gold opacity-50"></div>
                                        </div>
                                        <div className="mt-auto flex justify-between items-end border-t border-white/10 pt-8">
                                            <div className="text-left">
                                                <p className="text-xs uppercase tracking-widest text-gray-500">Mythos Press</p>
                                                <p className="text-xs text-gray-500">London • New York</p>
                                            </div>
                                            <div className="w-24 h-12 bg-white/10 flex items-center justify-center">
                                                <span className="text-[10px] text-gray-500">BARCODE</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {previewSide === 'SPREAD' && (
                                    <>
                                        {/* Back Cover (Left) */}
                                        <div className="w-1/2 h-full relative bg-[#1a1a1a] flex flex-col p-8 text-white border-r border-white/5">
                                            <div className="flex-1 flex flex-col justify-center items-center text-center">
                                                <p className={`text-sm leading-loose text-gray-300`} style={{ fontFamily: getFontFamily(config.layout.bodyFont) }}>
                                                    "{config.backCoverBlurb}"
                                                </p>
                                            </div>
                                            <div className="mt-auto flex justify-between items-end pt-4">
                                                <div className="text-left">
                                                    <p className="text-[10px] uppercase tracking-widest text-gray-500">Mythos Press</p>
                                                </div>
                                                <div className="w-16 h-8 bg-white/10 flex items-center justify-center">
                                                    <span className="text-[8px] text-gray-500">BARCODE</span>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Front Cover (Right) */}
                                        <div className="w-1/2 h-full relative bg-gray-100 flex flex-col">
                                            {config.coverImage ? (
                                                <img src={config.coverImage} alt="Cover" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#f4ecd8]">
                                                    <h1 className={`text-2xl mb-2 font-bold`} style={{ fontFamily: getFontFamily(config.layout.headingFont) }}>{activeStory.title}</h1>
                                                    <p className={`text-sm italic`} style={{ fontFamily: getFontFamily(config.layout.bodyFont) }}>{config.metadata.author}</p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <div 
                                className="max-w-full min-h-full"
                                style={{ padding: config.margins ? MARGIN_MAP[config.margins] : '3.75rem' }}
                            >
                                {/* Front Matter Rendering */}
                                <div className="text-center mb-24 min-h-[60vh] flex flex-col justify-center">
                                    <h1 className={`text-4xl md:text-5xl font-bold mb-6`} style={{ fontFamily: getFontFamily(config.layout.headingFont) }}>{activeStory.title}</h1>
                                    <p className={`text-xl text-gray-600 mb-12`} style={{ fontFamily: getFontFamily(config.layout.bodyFont) }}>{config.metadata.author}</p>
                                    {config.metadata.dedication && (
                                        <p className={`italic text-gray-500 mt-auto`} style={{ fontFamily: getFontFamily(config.layout.bodyFont) }}>{config.metadata.dedication}</p>
                                    )}
                                </div>

                                {/* Table of Contents (New Feature) */}
                                {config.includeTOC && chapters.length > 0 && (
                                    <div className="mb-24 page-break-before">
                                        <h2 className={`text-2xl font-bold mb-8 text-center`} style={{ fontFamily: getFontFamily(config.layout.headingFont) }}>Table of Contents</h2>
                                        <div className="space-y-4 max-w-md mx-auto">
                                            {chapters.map((ch, idx) => (
                                                <div key={idx} className="flex justify-between items-baseline border-b border-gray-200 pb-2">
                                                    <span className="text-gray-800" style={{ fontFamily: getFontFamily(config.layout.bodyFont) }}>{ch.title}</span>
                                                    <span className="text-gray-400 text-sm">{ch.page}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Extra Sections (Front) */}
                                {config.extraSections.filter(s => s.type === 'preface').map(s => (
                                    <div key={s.id} className="mb-16 page-break-before">
                                        <h2 className={`text-2xl font-bold mb-6`} style={{ fontFamily: getFontFamily(config.layout.headingFont) }}>{s.title}</h2>
                                        <div className={`whitespace-pre-wrap leading-relaxed text-gray-800`} style={{ fontSize: `${config.layout.fontSize}pt`, fontFamily: getFontFamily(config.layout.bodyFont) }}>
                                            {s.content}
                                        </div>
                                    </div>
                                ))}

                                {/* Main Content Sample */}
                                <div className="mb-16 page-break-before">
                                    <h2 className={`text-2xl font-bold mb-6`} style={{ fontFamily: getFontFamily(config.layout.headingFont) }}>Chapter One</h2>
                                    <div 
                                        className={`leading-relaxed text-gray-800 text-justify`}
                                        style={{ fontSize: `${config.layout.fontSize}pt`, fontFamily: getFontFamily(config.layout.bodyFont) }}
                                    >
                                        {/* Drop Cap Logic */}
                                        {config.layout.dropCaps ? (
                                            <>
                                                <span 
                                                    className="float-left text-5xl pr-2 font-bold text-black leading-[0.8]"
                                                    style={{ fontFamily: getFontFamily(config.layout.headingFont) }}
                                                >
                                                    {activeStory.content.split('\n\n')[0].replace(/^#.*\n/, '').replace(/^##.*\n/, '').charAt(0)}
                                                </span>
                                                <span>
                                                    {activeStory.content.split('\n\n')[0].replace(/^#.*\n/, '').replace(/^##.*\n/, '').slice(1) || "Start writing your story..."}
                                                </span>
                                            </>
                                        ) : (
                                            activeStory.content.split('\n\n')[0].replace(/^#.*\n/, '').replace(/^##.*\n/, '') || "Start writing your story..."
                                        )}
                                        {activeStory.content.length > 500 && "..."}
                                    </div>
                                    <p className="text-center text-gray-400 text-sm mt-8 italic">[Full content truncated for preview]</p>
                                </div>

                                {/* Extra Sections (Back) */}
                                {config.extraSections.filter(s => s.type === 'epilogue' || s.type === 'custom').map(s => (
                                    <div key={s.id} className="mb-16 page-break-before">
                                        <h2 className={`text-2xl font-bold mb-6`} style={{ fontFamily: getFontFamily(config.layout.headingFont) }}>{s.title}</h2>
                                        <div className={`whitespace-pre-wrap leading-relaxed text-gray-800`} style={{ fontSize: `${config.layout.fontSize}pt`, fontFamily: getFontFamily(config.layout.bodyFont) }}>
                                            {s.content}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
                .custom-scrollbar-light::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar-light::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .font-playfair { font-family: 'Playfair Display', serif; }
                .font-cinzel { font-family: 'Cinzel', serif; }
                .font-lato { font-family: 'Lato', sans-serif; }
                .font-garamond { font-family: 'EB Garamond', serif; }
                .font-roboto { font-family: 'Roboto', sans-serif; }
                .page-break-before { break-before: page; }
            `}</style>
        </div>
    );
};
