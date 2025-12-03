import React, { useState } from 'react';
import { StoryConfig, QuestionOption } from '../types';
import { quickAnalyze } from '../services/geminiService';

interface Props {
  onComplete: (config: StoryConfig) => void;
  onCancel: () => void;
}

interface QuestionConfig {
    id: string;
    label: string;
    desc: string;
    placeholder: string;
    options?: QuestionOption[];
}

const QUESTIONS: QuestionConfig[] = [
  { 
      id: 'corePremise', 
      label: '1. Core Premise / Next Direction', 
      desc: 'What is the central idea? If continuing, what happens next?', 
      placeholder: 'A detective uncovers a conspiracy...' 
  },
  { 
      id: 'genre', 
      label: '2. Genre & Subgenres', 
      desc: 'Primary genre and any blends.', 
      placeholder: 'Cyberpunk Thriller',
      options: [
          { label: 'Sci-Fi', value: 'Science Fiction' },
          { label: 'Fantasy', value: 'High Fantasy' },
          { label: 'Mystery', value: 'Noir Mystery' },
          { label: 'Horror', value: 'Psychological Horror' },
          { label: 'Romance', value: 'Historical Romance' }
      ]
  },
  { 
      id: 'tone', 
      label: '3. Tone', 
      desc: 'Overall emotional tone.', 
      placeholder: 'Dark, tense, atmospheric',
      options: [
          { label: 'Dark', value: 'Dark and gritty' },
          { label: 'Whimsical', value: 'Whimsical and lighthearted' },
          { label: 'Suspenseful', value: 'High-stakes suspense' },
          { label: 'Melancholic', value: 'Melancholic and introspective' }
      ]
  },
  { 
      id: 'narrativeStyle', 
      label: '4. Narrative Style', 
      desc: 'POV and writing style.', 
      placeholder: 'Third-person limited, noir style',
      options: [
          { label: '1st Person', value: 'First-person perspective' },
          { label: '3rd Limited', value: 'Third-person limited' },
          { label: 'Omniscient', value: 'Third-person omniscient' },
          { label: 'Epistolary', value: 'Journal entries and letters' }
      ]
  },
  { 
      id: 'targetAudience', 
      label: '5. Target Audience', 
      desc: 'Who is this story for?', 
      placeholder: 'Adult Sci-Fi fans',
      options: [
          { label: 'YA', value: 'Young Adult (14-18)' },
          { label: 'Adult', value: 'Adult Fiction' },
          { label: 'Children', value: 'Middle Grade (8-12)' }
      ]
  },
  { 
      id: 'lengthStructure', 
      label: '6. Length & Structure', 
      desc: 'Word count and structure type.', 
      placeholder: '5000 words, linear structure',
      options: [
          { label: 'Short Story', value: '3,000 words' },
          { label: 'Novelette', value: '10,000 words' },
          { label: 'Novella', value: '25,000 words' }
      ]
  },
  { 
      id: 'chapterCount', 
      label: '7. Chapter Count', 
      desc: 'How many chapters/segments should be generated?', 
      placeholder: 'e.g., 5',
      options: [
          { label: 'Single Shot (1)', value: '1' },
          { label: 'Short (3)', value: '3' },
          { label: 'Standard (5)', value: '5' },
          { label: 'Long (10)', value: '10' },
          { label: 'Epic (20)', value: '20' }
      ]
  },
  { 
      id: 'keyElements', 
      label: '8. Key Elements', 
      desc: 'Characters, Settings, Themes, Must-haves.', 
      placeholder: 'Protagonist: Kael. Setting: Neo-Tokyo.' 
  },
  { 
      id: 'complexity', 
      label: '9. Complexity & Detail', 
      desc: 'Subplots, research needs, sensory depth.', 
      placeholder: 'High complexity, accurate hacking tech',
      options: [
          { label: 'Low', value: 'Straightforward plot, focus on action' },
          { label: 'Medium', value: 'One subplot, moderate descriptive depth' },
          { label: 'High', value: 'Complex interwoven plots, hyper-realistic detail' }
      ]
  },
  { 
      id: 'endingType', 
      label: '10. Ending Type', 
      desc: 'Twist, tragic, happy, ambiguous?', 
      placeholder: 'Ambiguous and bittersweet',
      options: [
          { label: 'Twist', value: 'Shocking twist ending' },
          { label: 'Happy', value: 'Triumphant resolution' },
          { label: 'Tragic', value: 'Tragic downfall' },
          { label: 'Open', value: 'Ambiguous open ending' }
      ]
  },
  { 
      id: 'constraints', 
      label: '11. Constraints', 
      desc: 'Inspirations, taboo topics.', 
      placeholder: 'Inspired by Blade Runner, no romance' 
  },
];

export const StoryWizard: React.FC<Props> = ({ onComplete, onCancel }) => {
  const [mode, setMode] = useState<'SELECT' | 'WIZARD'>('SELECT');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<StoryConfig>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [quickFeedback, setQuickFeedback] = useState<string | null>(null);

  const startNew = () => {
      setAnswers({});
      setMode('WIZARD');
      setStep(0);
  }

  const startContinue = () => {
      setAnswers({ existingContent: '' });
      setMode('WIZARD');
      setStep(-1); // Special step for paste
  }

  const handleNext = async () => {
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
      setQuickFeedback(null);
    } else {
      setStep(QUESTIONS.length);
    }
  };

  const handleBack = () => {
    if (step === 0 && !answers.existingContent) {
        setMode('SELECT');
        return;
    }
    if (step === -1) {
        setMode('SELECT');
        return;
    }
    if (step === 0 && answers.existingContent) {
        setStep(-1);
        return;
    }
    if (step > 0) setStep(step - 1);
  };

  const handleChange = (val: string) => {
    if (step === -1) {
        setAnswers(prev => ({ ...prev, existingContent: val }));
    } else {
        setAnswers(prev => ({ ...prev, [QUESTIONS[step].id]: val }));
    }
  };

  const appendOption = (optValue: string) => {
      const currentVal = answers[QUESTIONS[step].id as keyof StoryConfig] || '';
      if (currentVal.includes(optValue)) return;
      const newVal = currentVal ? `${currentVal}, ${optValue}` : optValue;
      handleChange(newVal);
  }

  const checkPremise = async () => {
    if (step === 0 && answers.corePremise) {
        setIsAnalyzing(true);
        const feedback = await quickAnalyze(answers.corePremise);
        setQuickFeedback(feedback);
        setIsAnalyzing(false);
    }
  }

  // Mode Selection Screen
  if (mode === 'SELECT') {
      return (
        <div className="max-w-4xl mx-auto mt-20 px-4 animate-fade-in">
            <h2 className="text-4xl font-serif text-white text-center mb-12">How shall we begin?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <button 
                    onClick={startNew}
                    className="group bg-brand-800 p-10 rounded-3xl border border-brand-700 hover:border-brand-accent hover:bg-brand-800/80 transition-all text-left relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/10 rounded-bl-full group-hover:scale-110 transition-transform"></div>
                    <span className="material-symbols-outlined text-5xl text-brand-accent mb-6 bg-brand-900 p-4 rounded-2xl shadow-lg group-hover:bg-brand-accent group-hover:text-white transition-colors">edit_square</span>
                    <h3 className="text-2xl font-bold text-white mb-2">Start from Scratch</h3>
                    <p className="text-gray-400">Define your premise and let the AI weave a completely new tale.</p>
                </button>

                <button 
                    onClick={startContinue}
                    className="group bg-brand-800 p-10 rounded-3xl border border-brand-700 hover:border-brand-gold hover:bg-brand-800/80 transition-all text-left relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-gold/10 rounded-bl-full group-hover:scale-110 transition-transform"></div>
                    <span className="material-symbols-outlined text-5xl text-brand-gold mb-6 bg-brand-900 p-4 rounded-2xl shadow-lg group-hover:bg-brand-gold group-hover:text-brand-900 transition-colors">import_contacts</span>
                    <h3 className="text-2xl font-bold text-white mb-2">Continue Story</h3>
                    <p className="text-gray-400">Paste an existing story, chapter, or draft and continue where you left off.</p>
                </button>
            </div>
             <div className="text-center mt-12">
                 <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors">Cancel</button>
             </div>
        </div>
      );
  }

  // Review View
  if (step === QUESTIONS.length) {
    return (
      <div className="max-w-4xl mx-auto p-8 bg-brand-800 rounded-2xl shadow-2xl border border-brand-700 animate-fade-in my-8">
        <h2 className="text-3xl font-serif text-white mb-2">Manifesto Review</h2>
        <p className="text-gray-400 mb-8 border-b border-brand-700 pb-4">Verify your story parameters before initialization.</p>
        
        {answers.existingContent && (
             <div className="mb-6 p-4 bg-brand-900/50 rounded-xl border border-brand-700/50">
                 <span className="text-brand-gold text-xs font-bold uppercase tracking-wider block mb-1">Context</span>
                 <p className="text-gray-300 italic line-clamp-3">{answers.existingContent}</p>
             </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {QUESTIONS.map((q) => (
                <div key={q.id} className="p-4 bg-brand-900/50 rounded-xl border border-brand-700/50 hover:border-brand-600 transition-colors">
                    <span className="text-brand-accent text-xs font-bold uppercase tracking-wider block mb-1">{q.label}</span>
                    <span className="text-gray-200 font-medium">{answers[q.id as keyof StoryConfig] || "Not specified"}</span>
                </div>
            ))}
        </div>
        
        <div className="flex justify-between items-center pt-4 border-t border-brand-700">
            <button onClick={handleBack} className="text-gray-400 hover:text-white transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined">edit</span> Edit Details
            </button>
            <button 
                onClick={() => onComplete(answers as StoryConfig)} 
                className="px-10 py-4 bg-gradient-to-r from-brand-gold to-yellow-500 text-brand-900 font-bold text-lg rounded-xl hover:shadow-lg hover:shadow-yellow-500/20 transition-all transform hover:-translate-y-0.5 flex items-center gap-2"
            >
                <span className="material-symbols-outlined">auto_awesome</span>
                Generate Story
            </button>
        </div>
      </div>
    );
  }

  // Determine current question (handle step -1 for paste)
  const isPasteStep = step === -1;
  const currentQ = isPasteStep ? {
      id: 'existingContent',
      label: 'Existing Story Context',
      desc: 'Paste the story content you have so far. The AI will analyze this style and plot to continue seamlessly.',
      placeholder: 'Paste your story text here...',
      options: undefined
  } : QUESTIONS[step];

  return (
    <div className="max-w-3xl mx-auto mt-12 px-4">
      {/* Progress Bar */}
      <div className="mb-10">
         <div className="flex justify-between text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">
            <span>Configuration</span>
            <span>Step {isPasteStep ? 'Context' : step + 1} / {QUESTIONS.length}</span>
         </div>
         <div className="h-1 bg-brand-900 rounded-full overflow-hidden">
            <div 
                className="h-full bg-brand-accent transition-all duration-500 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                style={{ width: isPasteStep ? '5%' : `${((step + 1) / QUESTIONS.length) * 100}%` }}
            ></div>
         </div>
      </div>

      <div className="bg-brand-800 p-8 md:p-10 rounded-3xl shadow-2xl border border-brand-700 min-h-[500px] flex flex-col relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

        <div className="relative z-10 flex-1">
            <label className="block text-2xl md:text-3xl font-serif text-white mb-2 leading-tight">
                {currentQ.label}
            </label>
            <p className="text-gray-400 mb-8 text-lg font-light">{currentQ.desc}</p>
            
            <textarea
                className="w-full bg-brand-900/80 border border-brand-700 rounded-2xl p-6 text-white text-lg placeholder-gray-600 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all resize-none h-40 shadow-inner"
                placeholder={currentQ.placeholder}
                value={answers[currentQ.id as keyof StoryConfig] || ''}
                onChange={(e) => handleChange(e.target.value)}
                autoFocus
            />

            {currentQ.options && (
                <div className="mt-6">
                    <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 font-bold">Fast Select</p>
                    <div className="flex flex-wrap gap-3">
                        {currentQ.options.map((opt) => (
                            <button
                                key={opt.label}
                                onClick={() => appendOption(opt.value)}
                                className="px-4 py-2 bg-brand-700/50 hover:bg-brand-600 hover:border-brand-accent/50 text-gray-300 hover:text-white rounded-xl border border-brand-700 transition-all text-sm font-medium flex items-center gap-2 group/chip"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-accent group-hover/chip:bg-brand-gold transition-colors"></span>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {!isPasteStep && step === 0 && (
                <div className="mt-6">
                    <button 
                        onClick={checkPremise}
                        disabled={isAnalyzing || !answers.corePremise}
                        className="text-sm text-brand-accent hover:text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-brand-700/30 transition-colors w-fit"
                    >
                         {isAnalyzing ? (
                             <span className="w-4 h-4 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></span>
                         ) : (
                             <span className="material-symbols-outlined text-lg">bolt</span>
                         )}
                         {isAnalyzing ? 'Analyzing Premise...' : 'Quick AI Check'}
                    </button>
                    {quickFeedback && (
                        <div className="mt-4 p-4 bg-brand-900/50 rounded-xl text-sm text-gray-300 border-l-2 border-brand-gold animate-fade-in shadow-lg">
                            <strong className="text-brand-gold block mb-1">AI Feedback:</strong>
                            {quickFeedback}
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="flex justify-between items-center mt-10 pt-6 border-t border-brand-700/50">
            <button 
                onClick={handleBack}
                className="text-gray-500 hover:text-white px-6 py-3 rounded-xl hover:bg-brand-700/50 transition-colors font-medium"
            >
                Back
            </button>
            <button 
                onClick={handleNext}
                disabled={!answers[currentQ.id as keyof StoryConfig]}
                className="bg-brand-accent hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg hover:shadow-indigo-500/25 transform hover:-translate-y-0.5"
            >
                Next Step <span className="material-symbols-outlined">arrow_forward</span>
            </button>
        </div>
      </div>
    </div>
  );
};