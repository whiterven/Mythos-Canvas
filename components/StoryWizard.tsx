import React, { useState, useRef } from 'react';
import { StoryConfig, QuestionOption, LoreEntry } from '../types';
import { quickAnalyze } from '../services/geminiService';
import * as pdfjsLib from 'pdfjs-dist';

// Initialize PDF worker safely handling default export
const pdfApi = (pdfjsLib as any).default || pdfjsLib;
if (pdfApi?.GlobalWorkerOptions) {
    pdfApi.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

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

interface StoryTemplate {
    title: string;
    genre: string;
    icon: string;
    config: Partial<StoryConfig>;
}

const STORY_TEMPLATES: StoryTemplate[] = [
    {
        title: "The Starlight Guardian",
        genre: "Kids / Magical",
        icon: "auto_awesome",
        config: {
            corePremise: "In the sleepy town of Oakhaven, a lonely eight-year-old named Leo discovers a fallen star hiding in his dusty attic. But the star is fading, and the Shadow King—a creature made of nightmares who hunts light—is closing in. Leo must embark on a perilous journey across the Whispering Woods to return the star to the constellation of the Guardian before the last flicker dies out.",
            genre: "Children's Fantasy, Adventure, Coming-of-Age",
            tone: "Whimsical, heartwarming, wondrous, slightly perilous",
            narrativeStyle: "Third-person omniscient, simple and lyrical language",
            targetAudience: "Middle Grade (8-12)",
            lengthStructure: "Short Story, linear adventure structure",
            chapterCount: "3",
            keyElements: "Protagonist: Leo (brave but small). Companion: Lumina (the star). Antagonist: The Shadow King. Setting: Oakhaven and the magical Whispering Woods. Theme: Even the smallest light can conquer darkness.",
            complexity: "Low",
            endingType: "Happy",
            constraints: "No graphic violence, focus on problem solving through kindness and courage."
        }
    },
    {
        title: "Neon Rain",
        genre: "Sci-Fi / Noir",
        icon: "smart_toy",
        config: {
            corePremise: "New Shanghai, 2099. Rain never stops, and memories are the ultimate currency. Kael, a washed-up memory broker, stumbles upon a 'Ghost File'—a raw, unedited memory of a political assassination that history claims never happened. Now, hunted by the Synthetic Enforcers and his own fractured past, he must decrypt the file before his mind is wiped clean.",
            genre: "Cyberpunk, Noir Mystery, Tech-Thriller",
            tone: "Dark, gritty, atmospheric, cynical, rainy",
            narrativeStyle: "First-person perspective (hardboiled detective style)",
            targetAudience: "Adult Fiction",
            lengthStructure: "Novelette, with non-linear flashbacks to encrypted memories",
            chapterCount: "5",
            keyElements: "Setting: Dystopian New Shanghai. Tech: Mnemo-Link implants. Atmosphere: Perpetual rain, neon, urban decay. Conflict: One man against a mega-corporation rewriting history.",
            complexity: "High",
            endingType: "Twist",
            constraints: "Focus on sensory details of technology, rain, and urban isolation."
        }
    },
    {
        title: "Whispers of the Baobab",
        genre: "African Mythology",
        icon: "nature_people",
        config: {
            corePremise: "In a solarpunk Lagos where ancient spirits merge with holographic tech, Zuri, a datamancer, accidentally downloads the consciousness of Eshu, the Trickster God, into her neural link. Eshu demands a tribute: restore the flow of the digital river that sustains the city, or he will unleash a virus of chaos. Zuri must navigate the spirit realm and the dark web to save her home.",
            genre: "Afrofuturism, Mythic Fantasy, Urban Fantasy",
            tone: "Vibrant, rhythmic, spiritual yet high-tech, energetic",
            narrativeStyle: "Third-person limited, rich cultural imagery",
            targetAudience: "Young Adult (14-18)",
            lengthStructure: "Short Story",
            chapterCount: "5",
            keyElements: "Fusion: Yoruba mythology meets advanced cybernetics. Setting: Neo-Lagos with floating cars and spirit shrines. Characters: Zuri (tech-savvy), Eshu (chaotic ancient spirit). Theme: Balancing tradition with progress.",
            complexity: "Medium",
            endingType: "Open",
            constraints: "Respectful integration of Yoruba mythology and modern African urban life."
        }
    },
    {
        title: "The Oracle's Lament",
        genre: "Greek Mythology",
        icon: "temple_buddhist",
        config: {
            corePremise: "A forgotten minor god of margins and footnotes attempts to change a prophecy to save a mortal scribe they have fallen in love with, defying Zeus's absolute decree. As the Fates weave the final thread, the god must trade their immortality for a chance to rewrite a single line of history.",
            genre: "Historical Fantasy, Romance, Tragedy",
            tone: "Epic, tragic, poetic, grand",
            narrativeStyle: "Third-person omniscient, elevated prose",
            targetAudience: "Adult",
            lengthStructure: "Novelette",
            chapterCount: "5",
            keyElements: "Setting: Mount Olympus and Ancient Athens. Conflict: Fate vs. Free Will. Characters: The Nameless God, Elara the Scribe. Theme: Sacrifice for love.",
            complexity: "High",
            endingType: "Tragic",
            constraints: "Use homeric epithets occasionally. Classical dialogue style. Emotional weight."
        }
    },
    {
        title: "Quantum Hearts",
        genre: "Sci-Fi Romance",
        icon: "favorite",
        config: {
            corePremise: "Dr. Aris Thorne and Commander Elara Vance are on opposite sides of a galactic war, separated by light-years. Through a freak accident in a quantum entanglement experiment, they begin to hear each other's thoughts. As the war escalates, their connection deepens from suspicion to intimacy, leading them to plot a way to end the war so they can meet for the first time.",
            genre: "Space Opera, Romance, Drama",
            tone: "Melancholic, longing, intellectual, high-stakes",
            narrativeStyle: "Epistolary (Logs, messages, and shared thoughts)",
            targetAudience: "Adult",
            lengthStructure: "Short Story",
            chapterCount: "3",
            keyElements: "Theme: Connection across impossible distance. Tech: Quantum Communicator. Setting: Two different starships. Ending: They finally meet in the ruins of a battlefield.",
            complexity: "Medium",
            endingType: "Bittersweet",
            constraints: "Focus on dialogue and internal monologues. Minimal action, maximum emotion."
        }
    },
    {
        title: "The Clockwork Alchemist",
        genre: "Steampunk Fantasy",
        icon: "settings",
        config: {
            corePremise: "In a fog-choked Victorian London powered by steam and alchemy, Lyra, a disgraced alchemist, discovers the formula for the 'Philosopher's Gear'—an engine of infinite energy. Hunted by the Royal Gear Guard and the Clockwork Cabal, she must race to install the heart into her automaton father to save his soul before the city consumes them both.",
            genre: "Steampunk, Fantasy, Adventure",
            tone: "Adventurous, gritty, steam-filled, urgent",
            narrativeStyle: "Third-person limited",
            targetAudience: "Young Adult",
            lengthStructure: "Standard adventure",
            chapterCount: "5",
            keyElements: "Setting: Victorian London with mechs and airships. Magic: Alchemy and Steam. Item: The Philosophers Gear. Antagonist: The Lord High Mechanist.",
            complexity: "Medium",
            endingType: "Happy",
            constraints: "Detailed descriptions of machinery, brass, gears, and steam."
        }
    },
    {
        title: "Midnight at the Manor",
        genre: "Mystery / Horror",
        icon: "local_library",
        config: {
            corePremise: "Six strangers receive golden invitations to Blackwood Manor for a dinner party hosted by a recluse billionaire. When they arrive, the doors lock, and the host is found dead at the head of the table. As a storm rages outside, they realize the killer is among them—and the house itself seems to be shifting to trap them.",
            genre: "Gothic Horror, Murder Mystery, Thriller",
            tone: "Suspenseful, claustrophobic, eerie, psychological",
            narrativeStyle: "Third-person rotating POV (shifting between guests)",
            targetAudience: "Adult",
            lengthStructure: "Classic whodunit structure",
            chapterCount: "5",
            keyElements: "Setting: Decaying Victorian Mansion during a storm. Trope: Locked room mystery. Characters: The Soldier, The Actress, The Doctor, The thief. Secret: Everyone has a connection to the host.",
            complexity: "Medium",
            endingType: "Twist",
            constraints: "No supernatural elements, purely psychological and physical danger. High tension."
        }
    },
    {
        title: "Echoes of the Ronin",
        genre: "Historical Tradition",
        icon: "swords",
        config: {
            corePremise: "Japan, 1605. Kenji, a masterless samurai (Ronin) haunted by his failure to protect his lord, travels the countryside seeking redemption. He arrives in a village threatened by bandits who demand their harvest. Kenji must teach the villagers to defend themselves and face the bandit leader—a ghost from his past—without drawing his blood-stained blade until the final moment.",
            genre: "Historical Fiction, Action, Drama",
            tone: "Honor-bound, contemplative, intense, atmospheric",
            narrativeStyle: "Third-person limited (Stoic and observational)",
            targetAudience: "Adult",
            lengthStructure: "Short Story",
            chapterCount: "3",
            keyElements: "Setting: Edo period Japan (Autumn). Theme: Bushido, Pacifism vs. Necessity. Conflict: Internal guilt vs. External threat.",
            complexity: "Medium",
            endingType: "Triumphant",
            constraints: "Historical accuracy in weapons, tea ceremonies, and customs. Slow build to fast action."
        }
    }
];

export const StoryWizard: React.FC<Props> = ({ onComplete, onCancel }) => {
  const [mode, setMode] = useState<'SELECT' | 'WIZARD' | 'TEMPLATES'>('SELECT');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<StoryConfig>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [quickFeedback, setQuickFeedback] = useState<string | null>(null);
  
  // Lore Builder State
  const [lore, setLore] = useState<LoreEntry[]>([]);
  const [tempLoreName, setTempLoreName] = useState('');
  const [tempLoreType, setTempLoreType] = useState<'Character' | 'Location' | 'Item' | 'Rule'>('Character');
  const [tempLoreDesc, setTempLoreDesc] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const startNew = () => {
      setAnswers({});
      setMode('WIZARD');
      setStep(0);
  }

  const startContinue = () => {
      setAnswers({ existingContent: '' });
      setMode('WIZARD');
      setStep(-1); // Special step for paste/upload
  }

  const handleTemplateSelect = (template: StoryTemplate) => {
      setAnswers(template.config);
      setMode('WIZARD');
      setStep(QUESTIONS.length); // Jump to Review
  }

  const handleNext = async () => {
    // Current step logic
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
      setQuickFeedback(null);
    } else {
      // Go to Review
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
        setAnswers(prev => ({ ...prev, [QUESTIONS[step].id]: val } as any));
    }
  };

  const appendOption = (optValue: string) => {
      const currentVal = (answers[QUESTIONS[step].id as keyof StoryConfig] as string) || '';
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

  const addLoreEntry = () => {
      if (!tempLoreName.trim() || !tempLoreDesc.trim()) return;
      const newEntry: LoreEntry = {
          id: Date.now().toString(),
          name: tempLoreName,
          category: tempLoreType,
          description: tempLoreDesc
      };
      setLore([...lore, newEntry]);
      setTempLoreName('');
      setTempLoreDesc('');
  };

  const removeLoreEntry = (id: string) => {
      setLore(lore.filter(l => l.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
          let text = '';
          if (file.type === 'application/pdf') {
              const arrayBuffer = await file.arrayBuffer();
              const pdf = await pdfApi.getDocument({ data: arrayBuffer }).promise;
              
              for (let i = 1; i <= pdf.numPages; i++) {
                  const page = await pdf.getPage(i);
                  const textContent = await page.getTextContent();
                  const pageText = textContent.items.map((item: any) => item.str).join(' ');
                  text += pageText + '\n\n';
              }
          } else {
              // Assume Text based
              text = await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onload = (ev) => resolve(ev.target?.result as string);
                  reader.readAsText(file);
              });
          }

          if (text) {
              handleChange(text);
          }
      } catch (err) {
          console.error("File read error", err);
          alert("Could not read file. Please try pasting the text instead.");
      } finally {
          setIsUploading(false);
          // Reset input
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  // Template View
  if (mode === 'TEMPLATES') {
      return (
          <div className="max-w-7xl mx-auto mt-4 md:mt-8 px-4 animate-fade-in pb-12">
              <div className="flex items-center gap-4 mb-8">
                  <button onClick={() => setMode('SELECT')} className="p-2 rounded-full bg-brand-800 hover:bg-brand-700 text-gray-400 hover:text-white transition-colors">
                      <span className="material-symbols-outlined">arrow_back</span>
                  </button>
                  <div>
                      <h2 className="text-2xl md:text-3xl font-serif text-white">Story Templates</h2>
                      <p className="text-gray-400 text-sm">Select a rich archetype to jumpstart your narrative.</p>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {STORY_TEMPLATES.map((t, idx) => (
                      <div 
                        key={idx} 
                        className="bg-brand-800 border border-brand-700 rounded-2xl p-6 flex flex-col hover:border-brand-gold/50 transition-all hover:shadow-xl hover:-translate-y-1 group cursor-pointer h-full"
                        onClick={() => handleTemplateSelect(t)}
                      >
                          <div className="flex justify-between items-start mb-4">
                              <div className="w-12 h-12 bg-brand-900 rounded-xl flex items-center justify-center border border-brand-700 group-hover:border-brand-gold/30 transition-colors flex-shrink-0">
                                  <span className="material-symbols-outlined text-2xl text-brand-gold">{t.icon}</span>
                              </div>
                              <span className="text-[10px] uppercase font-bold tracking-widest bg-brand-900 px-2 py-1 rounded text-gray-400 text-right">{t.genre}</span>
                          </div>
                          <h3 className="text-lg font-bold text-white mb-2 font-serif group-hover:text-brand-gold transition-colors">{t.title}</h3>
                          <p className="text-sm text-gray-400 leading-relaxed mb-6 line-clamp-5 flex-1">{t.config.corePremise}</p>
                          <div className="mt-auto">
                              <div className="flex gap-2 mb-4 flex-wrap">
                                  {t.config.chapterCount && <span className="text-[10px] bg-brand-900 px-2 py-1 rounded text-gray-500">{t.config.chapterCount} Chapters</span>}
                                  {t.config.complexity && <span className="text-[10px] bg-brand-900 px-2 py-1 rounded text-gray-500">{t.config.complexity} Complexity</span>}
                              </div>
                              <button className="w-full py-3 bg-brand-700 hover:bg-brand-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2">
                                  Use Template
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )
  }

  // Mode Selection Screen
  if (mode === 'SELECT') {
      return (
        <div className="max-w-5xl mx-auto mt-6 md:mt-20 px-4 animate-fade-in">
            <h2 className="text-2xl md:text-4xl font-serif text-white text-center mb-6 md:mb-12">How shall we begin?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <button 
                    onClick={startNew}
                    className="group bg-brand-800 p-8 rounded-3xl border border-brand-700 hover:border-brand-accent hover:bg-brand-800/80 transition-all text-left relative overflow-hidden flex flex-col h-full"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/10 rounded-bl-full group-hover:scale-110 transition-transform"></div>
                    <span className="material-symbols-outlined text-4xl text-brand-accent mb-6 bg-brand-900 p-4 rounded-2xl shadow-lg w-fit group-hover:bg-brand-accent group-hover:text-white transition-colors">edit_square</span>
                    <h3 className="text-xl font-bold text-white mb-2">Start from Scratch</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">Define your premise step-by-step and let the AI weave a completely new tale.</p>
                </button>

                <button 
                    onClick={() => setMode('TEMPLATES')}
                    className="group bg-brand-800 p-8 rounded-3xl border border-brand-700 hover:border-purple-400 hover:bg-brand-800/80 transition-all text-left relative overflow-hidden flex flex-col h-full"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-bl-full group-hover:scale-110 transition-transform"></div>
                    <span className="material-symbols-outlined text-4xl text-purple-400 mb-6 bg-brand-900 p-4 rounded-2xl shadow-lg w-fit group-hover:bg-purple-500 group-hover:text-white transition-colors">style</span>
                    <h3 className="text-xl font-bold text-white mb-2">Browse Templates</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">Choose from curated archetypes like African Myth, Sci-Fi Noir, or Fantasy.</p>
                </button>

                <button 
                    onClick={startContinue}
                    className="group bg-brand-800 p-8 rounded-3xl border border-brand-700 hover:border-brand-gold hover:bg-brand-800/80 transition-all text-left relative overflow-hidden flex flex-col h-full"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-gold/10 rounded-bl-full group-hover:scale-110 transition-transform"></div>
                    <span className="material-symbols-outlined text-4xl text-brand-gold mb-6 bg-brand-900 p-4 rounded-2xl shadow-lg w-fit group-hover:bg-brand-gold group-hover:text-brand-900 transition-colors">import_contacts</span>
                    <h3 className="text-xl font-bold text-white mb-2">Continue Story</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">Upload a PDF/TXT or paste an existing story to continue where you left off.</p>
                </button>
            </div>
             <div className="text-center mt-12">
                 <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors text-sm">Return to Dashboard</button>
             </div>
        </div>
      );
  }

  // Manifesto Review View
  if (step === QUESTIONS.length) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-8 bg-brand-800 rounded-2xl shadow-2xl border border-brand-700 animate-fade-in my-4 md:my-8">
        <h2 className="text-2xl md:text-3xl font-serif text-white mb-2">Manifesto Review</h2>
        <p className="text-gray-400 mb-6 md:mb-8 border-b border-brand-700 pb-4">Verify or edit your story parameters directly before initialization.</p>
        
        {answers.existingContent && (
             <div className="mb-6 p-4 bg-brand-900/50 rounded-xl border border-brand-700/50">
                 <span className="text-brand-gold text-xs font-bold uppercase tracking-wider block mb-1">Context</span>
                 <p className="text-gray-300 italic line-clamp-3 text-sm">{answers.existingContent.slice(0, 300)}...</p>
             </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {QUESTIONS.map((q) => (
                <div key={q.id} className="p-3 md:p-4 bg-brand-900/50 rounded-xl border border-brand-700/50 hover:border-brand-600 transition-colors group focus-within:border-brand-accent focus-within:ring-1 focus-within:ring-brand-accent/50">
                    <label htmlFor={`review-${q.id}`} className="text-brand-accent text-[10px] md:text-xs font-bold uppercase tracking-wider block mb-2 cursor-pointer group-focus-within:text-white transition-colors">{q.label}</label>
                    <textarea 
                        id={`review-${q.id}`}
                        value={(answers[q.id as keyof StoryConfig] as string) || ""}
                        onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        className="w-full bg-transparent border-none text-gray-200 font-medium text-sm md:text-base focus:outline-none focus:ring-0 p-0 resize-none min-h-[80px] placeholder-gray-600 custom-scrollbar leading-relaxed"
                        placeholder="Not specified"
                    />
                </div>
            ))}
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-brand-700">
            <button onClick={handleBack} className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-base">arrow_back</span> Back to Wizard
            </button>
            <div className="flex gap-4 w-full md:w-auto">
                 <button 
                    onClick={() => onComplete({ ...answers, lore: [] } as StoryConfig)} 
                    className="flex-1 md:flex-none px-6 py-4 bg-brand-800 hover:bg-brand-700 text-gray-300 hover:text-white font-bold text-sm rounded-xl border border-brand-700 hover:border-brand-600 transition-all flex items-center justify-center gap-2"
                >
                    Skip Bible
                </button>
                <button 
                    onClick={() => setStep(step + 1)} 
                    className="flex-1 md:flex-none px-10 py-4 bg-gradient-to-r from-brand-gold to-yellow-500 text-brand-900 font-bold text-lg rounded-xl hover:shadow-lg hover:shadow-yellow-500/20 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                    <span className="material-symbols-outlined">public</span>
                    Next: World Bible
                </button>
            </div>
        </div>
      </div>
    );
  }

  // Lore / World Bible View (New Step)
  if (step === QUESTIONS.length + 1) {
      return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in my-4 md:my-8 h-auto lg:h-[85vh] min-h-0 flex flex-col">
            <div className="mb-6 flex-none">
                <h2 className="text-3xl font-serif text-white mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-brand-gold text-3xl">public</span>
                    World Bible
                </h2>
                <p className="text-gray-400 text-sm">Define characters, locations, items, and rules. The AI will strictly adhere to these facts.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 lg:min-h-0">
                {/* Form Side - Enhanced Visibility */}
                <div className="lg:col-span-4 flex flex-col gap-4 bg-brand-800 p-6 rounded-2xl border border-brand-700 h-auto lg:h-full lg:overflow-y-auto shadow-xl relative custom-scrollbar order-1">
                    {/* Subtle Gradient Accent at Top */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-accent to-brand-gold rounded-t-2xl opacity-50"></div>
                    
                    <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-brand-accent">add_circle</span> 
                        Add New Entry
                    </h3>
                    <p className="text-xs text-gray-400 mb-4 border-b border-brand-700 pb-4">
                        Define a new entity to guide the story generation.
                    </p>

                    <div>
                        <label className="text-xs text-brand-gold/80 uppercase font-bold block mb-1.5 ml-1">Name</label>
                        <input 
                            type="text" 
                            value={tempLoreName} 
                            onChange={(e) => setTempLoreName(e.target.value)}
                            placeholder="e.g. The Sapphire Key"
                            className="w-full bg-brand-900 border border-brand-600/50 rounded-xl p-3.5 text-white placeholder-gray-500 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/50 outline-none transition-all shadow-inner"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-brand-gold/80 uppercase font-bold block mb-1.5 ml-1">Category</label>
                        <div className="relative">
                             <select 
                                value={tempLoreType}
                                onChange={(e) => setTempLoreType(e.target.value as any)}
                                className="w-full bg-brand-900 border border-brand-600/50 rounded-xl p-3.5 text-white focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/50 outline-none appearance-none transition-all shadow-inner cursor-pointer"
                            >
                                <option value="Character">Character</option>
                                <option value="Location">Location</option>
                                <option value="Item">Item / Artifact</option>
                                <option value="Rule">Rule / Law</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                <span className="material-symbols-outlined text-sm">expand_more</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col">
                        <label className="text-xs text-brand-gold/80 uppercase font-bold block mb-1.5 ml-1">Description</label>
                        <textarea 
                            value={tempLoreDesc}
                            onChange={(e) => setTempLoreDesc(e.target.value)}
                            placeholder="Describe appearance, personality, hidden properties, or strict rules..."
                            className="w-full h-32 md:h-48 bg-brand-900 border border-brand-600/50 rounded-xl p-3.5 text-white placeholder-gray-500 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/50 outline-none resize-none transition-all shadow-inner leading-relaxed"
                        />
                    </div>

                    <button 
                        onClick={addLoreEntry}
                        disabled={!tempLoreName.trim() || !tempLoreDesc.trim()}
                        className="w-full py-4 mt-auto bg-gradient-to-r from-brand-accent to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-500/25 active:scale-95"
                    >
                        <span className="material-symbols-outlined">save</span> Add to Bible
                    </button>
                </div>

                {/* List Side */}
                <div className="lg:col-span-8 flex flex-col bg-brand-800 p-6 rounded-2xl border border-brand-700 h-[500px] lg:h-full order-2">
                    <div className="flex justify-between items-center mb-4 border-b border-brand-700 pb-2 flex-none">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <span className="material-symbols-outlined text-brand-gold">library_books</span> Bible Entries
                        </h3>
                        <span className="text-xs text-gray-500 bg-brand-900 px-2 py-1 rounded">{lore.length} Entries</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                        {lore.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60">
                                <span className="material-symbols-outlined text-6xl mb-2">menu_book</span>
                                <p>No entries yet. Add context to guide the AI.</p>
                            </div>
                        ) : (
                            lore.map(item => (
                                <div key={item.id} className="bg-brand-900/50 border border-brand-700 p-4 rounded-xl flex gap-4 group hover:border-brand-600 transition-colors">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 
                                        ${item.category === 'Character' ? 'bg-purple-500/20 text-purple-400' : 
                                          item.category === 'Location' ? 'bg-green-500/20 text-green-400' :
                                          item.category === 'Item' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                                        <span className="material-symbols-outlined">
                                            {item.category === 'Character' ? 'person' : 
                                             item.category === 'Location' ? 'landscape' : 
                                             item.category === 'Item' ? 'diamond' : 'gavel'}
                                        </span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <h4 className="text-white font-bold text-lg">{item.name}</h4>
                                            <span className="text-[10px] uppercase tracking-widest text-gray-500 bg-brand-900 px-1.5 py-0.5 rounded">{item.category}</span>
                                        </div>
                                        <p className="text-gray-400 text-sm mt-1 leading-relaxed whitespace-pre-wrap">{item.description}</p>
                                    </div>
                                    <button 
                                        onClick={() => removeLoreEntry(item.id)}
                                        className="text-gray-600 hover:text-red-400 self-start p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <span className="material-symbols-outlined">delete</span>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-brand-700 flex justify-between items-center gap-4 flex-none">
                         <button onClick={() => setStep(step - 1)} className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm">
                            <span className="material-symbols-outlined text-base">arrow_back</span> Back to Manifesto
                        </button>
                        <button 
                            onClick={() => onComplete({ ...answers, lore } as StoryConfig)} 
                            className="bg-brand-accent hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 transform hover:-translate-y-0.5"
                        >
                            <span className="material-symbols-outlined">auto_awesome</span>
                            Start Weaving Story
                        </button>
                    </div>
                </div>
            </div>
        </div>
      );
  }

  // Determine current question (handle step -1 for paste)
  const isPasteStep = step === -1;
  const currentQ = isPasteStep ? {
      id: 'existingContent',
      label: 'Existing Story Context',
      desc: 'Upload a PDF/TXT file or paste the story content you have so far.',
      placeholder: 'Paste your story text here...',
      options: undefined
  } : QUESTIONS[step];

  return (
    <div className="max-w-3xl mx-auto mt-4 md:mt-12 px-2 md:px-4">
      {/* Progress Bar */}
      <div className="mb-6 md:mb-10">
         <div className="flex justify-between text-[10px] md:text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">
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

      <div className="bg-brand-800 p-5 md:p-10 rounded-3xl shadow-2xl border border-brand-700 min-h-[400px] md:min-h-[500px] flex flex-col relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

        <div className="relative z-10 flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <label className="block text-xl md:text-3xl font-serif text-white leading-tight">
                    {currentQ.label}
                </label>
                {isPasteStep && (
                    <div className="flex-shrink-0">
                        <input 
                            type="file" 
                            accept=".pdf,.txt" 
                            ref={fileInputRef}
                            className="hidden" 
                            onChange={handleFileUpload} 
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex items-center gap-2 bg-brand-900 border border-brand-700 hover:border-brand-gold text-brand-gold hover:text-white px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all shadow-sm active:scale-95"
                        >
                            {isUploading ? (
                                <span className="w-4 h-4 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></span>
                            ) : (
                                <span className="material-symbols-outlined text-lg">upload_file</span>
                            )}
                            {isUploading ? 'Reading...' : 'Upload File'}
                        </button>
                    </div>
                )}
            </div>
            
            <p className="text-gray-400 mb-6 md:mb-8 text-sm md:text-lg font-light">{currentQ.desc}</p>
            
            <textarea
                className="w-full bg-brand-900/80 border border-brand-700 rounded-2xl p-4 md:p-6 text-white text-base md:text-lg placeholder-gray-600 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all resize-none h-32 md:h-40 shadow-inner flex-1"
                placeholder={currentQ.placeholder}
                value={(answers[currentQ.id as keyof StoryConfig] as string) || ''}
                onChange={(e) => handleChange(e.target.value)}
                autoFocus
            />

            {currentQ.options && (
                <div className="mt-6">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3 font-bold">Fast Select</p>
                    <div className="flex flex-wrap gap-2 md:gap-3">
                        {currentQ.options.map((opt) => (
                            <button
                                key={opt.label}
                                onClick={() => appendOption(opt.value)}
                                className="px-3 py-2 md:px-4 md:py-2 bg-brand-700/50 hover:bg-brand-600 hover:border-brand-accent/50 text-gray-300 hover:text-white rounded-xl border border-brand-700 transition-all text-xs md:text-sm font-medium flex items-center gap-2 group/chip"
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
                        className="text-xs md:text-sm text-brand-accent hover:text-white flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 rounded-lg hover:bg-brand-700/30 transition-colors w-fit border border-brand-accent/20"
                    >
                         {isAnalyzing ? (
                             <span className="w-4 h-4 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></span>
                         ) : (
                             <span className="material-symbols-outlined text-base md:text-lg">bolt</span>
                         )}
                         {isAnalyzing ? 'Analyzing...' : 'Quick AI Check'}
                    </button>
                    {quickFeedback && (
                        <div className="mt-4 p-3 md:p-4 bg-brand-900/50 rounded-xl text-xs md:text-sm text-gray-300 border-l-2 border-brand-gold animate-fade-in shadow-lg">
                            <strong className="text-brand-gold block mb-1">AI Feedback:</strong>
                            {quickFeedback}
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="flex justify-between items-center mt-6 md:mt-10 pt-4 md:pt-6 border-t border-brand-700/50">
            <button 
                onClick={handleBack}
                className="text-gray-500 hover:text-white px-4 py-2 md:px-6 md:py-3 rounded-xl hover:bg-brand-700/50 transition-colors font-medium text-sm md:text-base"
            >
                Back
            </button>
            <button 
                onClick={handleNext}
                disabled={!answers[currentQ.id as keyof StoryConfig]}
                className="bg-brand-accent hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 md:px-8 md:py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg hover:shadow-indigo-500/25 transform hover:-translate-y-0.5 text-sm md:text-base"
            >
                Next Step <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
        </div>
      </div>
    </div>
  );
};