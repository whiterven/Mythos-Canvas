import React, { useState } from 'react';
import { editImage } from '../services/geminiService';

export const ImageStudio: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setPreviewUrl(e.target?.result as string);
      reader.readAsDataURL(file);
      setResultImage(null);
    }
  };

  const handleEdit = async () => {
    if (!selectedFile || !prompt) return;
    
    setIsGenerating(true);
    try {
      const result = await editImage(selectedFile, prompt);
      setResultImage(result);
    } catch (error) {
      alert("Failed to process image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 animate-fade-in">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-serif text-white mb-2 flex items-center justify-center gap-3">
            <span className="material-symbols-outlined text-brand-gold text-4xl">image_edit_auto</span>
            Canvas Studio
        </h2>
        <p className="text-gray-400">Powered by advanced vision AI. Upload a visual and transform it with text.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <div className="bg-brand-800 p-6 rounded-2xl border border-brand-700">
            <h3 className="text-xl font-medium text-white mb-4">Source Image</h3>
            
            <div className="border-2 border-dashed border-brand-700 rounded-xl h-64 flex flex-col items-center justify-center bg-brand-900/50 hover:border-brand-accent transition-colors relative overflow-hidden group">
                {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="h-full w-full object-contain" />
                ) : (
                    <div className="text-center p-6 pointer-events-none">
                        <span className="material-symbols-outlined text-4xl text-gray-500 mb-2">upload_file</span>
                        <p className="text-sm text-gray-400">Click to upload or drag & drop</p>
                    </div>
                )}
                <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                />
            </div>

            <div className="mt-6">
                <label className="block text-sm text-gray-400 mb-2">Editing Prompt</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., Add a retro filter, Remove background..."
                        className="flex-1 bg-brand-900 border border-brand-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-accent"
                    />
                    <button
                        onClick={handleEdit}
                        disabled={!selectedFile || !prompt || isGenerating}
                        className="bg-brand-accent hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        {isGenerating ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <span className="material-symbols-outlined">auto_fix_high</span>
                        )}
                    </button>
                </div>
            </div>
        </div>

        {/* Output Section */}
        <div className="bg-brand-800 p-6 rounded-2xl border border-brand-700 flex flex-col">
            <h3 className="text-xl font-medium text-white mb-4">Result</h3>
            <div className="flex-1 bg-black/40 rounded-xl flex items-center justify-center border border-brand-700 overflow-hidden relative min-h-[300px]">
                {resultImage ? (
                    <img src={resultImage} alt="Generated" className="max-w-full max-h-full object-contain shadow-2xl" />
                ) : isGenerating ? (
                    <div className="text-center">
                         <div className="w-12 h-12 border-4 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                         <p className="text-brand-accent animate-pulse">Designing...</p>
                    </div>
                ) : (
                    <p className="text-gray-500 italic">Generated image will appear here</p>
                )}
                
                {resultImage && (
                    <a 
                        href={resultImage} 
                        download="gemini-edit.png"
                        className="absolute bottom-4 right-4 bg-brand-900/80 text-white p-2 rounded-full hover:bg-black transition-colors backdrop-blur-sm"
                        title="Download"
                    >
                        <span className="material-symbols-outlined">download</span>
                    </a>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};